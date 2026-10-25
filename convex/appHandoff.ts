/**
 * Android / iOS app shell → its WebView. The app signs in natively (password, vân tay / Face ID,
 * passkey) and keeps its own Convex Auth session for push and background sync. The WebView needs a
 * session of its own: sharing one refresh token between two clients trips Convex Auth's reuse
 * detection and ends the session. So the signed-in app asks for a single-use code (`issue`) and
 * hands it to the WebView over the native message bridge (never in a URL); the web exchanges it
 * with `signIn("app-handoff", { code })` (provider in convex/auth.ts) for a fresh session.
 *
 * Only the SHA-256 of a code is stored; a code lives 60 seconds and is deleted when used. Issuing
 * re-checks the account (active, not locked, no pending mandatory password change), and session
 * creation re-checks it again (`beforeSessionCreation`).
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import { APP_HANDOFF_TTL_MS, appHandoffCodeHash, newAppHandoffCode } from "./appHandoffCode";
import { currentUserOrThrow } from "./lib";

/** Signed-in app: a single-use code for its WebView (expires in 60 s). */
export const issue = action({
  args: {},
  handler: async (ctx): Promise<{ code: string; expiresInMs: number }> => {
    const code = newAppHandoffCode();
    await ctx.runMutation(internal.appHandoff.store, { codeHash: await appHandoffCodeHash(code) });
    return { code, expiresInMs: APP_HANDOFF_TTL_MS };
  },
});

export const store = internalMutation({
  args: { codeHash: v.string() },
  handler: async (ctx, args) => {
    const user = await currentUserOrThrow(ctx);
    if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
    if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
    const now = Date.now();
    // One live code per account; expired codes of anyone are swept as we go.
    for (const row of await ctx.db.query("appWebHandoffs").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db.query("appWebHandoffs").withIndex("by_expires", (q) => q.lt("expiresAt", now)).take(50)) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.insert("appWebHandoffs", { userId: user._id, codeHash: args.codeHash, createdAt: now, expiresAt: now + APP_HANDOFF_TTL_MS });
  },
});

/** Used by the `app-handoff` sign-in provider: the code's account, once, while fresh; otherwise null. */
export const consume = internalMutation({
  args: { codeHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("appWebHandoffs").withIndex("by_code_hash", (q) => q.eq("codeHash", args.codeHash)).unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    return row.expiresAt > Date.now() ? row.userId : null;
  },
});
