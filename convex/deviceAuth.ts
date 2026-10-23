import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { currentUserOrThrow } from "./lib";
import {
  assertPlatform,
  base64UrlEncode,
  challengeUsable,
  CHALLENGE_INVALID,
  CHALLENGE_TTL_MS,
  cleanDeviceName,
  DEFAULT_RP_ID,
  DEVICE_CREDENTIAL_INVALID,
  DEVICE_CREDENTIAL_LIMIT,
  DEVICE_SIGNATURE_INVALID,
  deviceSignedMessage,
  MAX_DEVICE_CREDENTIALS_PER_USER,
  normalizeP256PublicKey,
  PASSKEY_VERIFICATION_FAILED,
  passkeyOrigins,
  type ChallengePurpose,
} from "./deviceAuthPolicy";

/**
 * Đăng nhập bằng vân tay / Face ID (device key) và passkey.
 * - Registration needs a signed-in, active user without a pending password change.
 * - Sign-in goes through Convex Auth providers `device-key` / `passkey` (convex/auth.ts), so
 *   beforeSessionCreation still blocks inactive and locked accounts.
 * - Only public keys are stored. A credential is revoked by its owner, or for everyone of a user
 *   when an admin / the forgot-password flow rotates the password.
 */

export function rpId() {
  return process.env.PASSKEY_RP_ID || DEFAULT_RP_ID;
}

export function origins() {
  return passkeyOrigins(rpId(), process.env.PASSKEY_EXTRA_ORIGINS || "");
}

function randomChallenge() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

// ------------------------------------------------------------------ internal helpers

async function issue(ctx: { db: any }, purpose: ChallengePurpose, userId?: string) {
  const now = Date.now();
  // Opportunistic purge keeps the table tiny without a cron.
  const expired = await ctx.db
    .query("authChallenges")
    .withIndex("by_expires", (q: any) => q.lt("expiresAt", now))
    .take(25);
  for (const row of expired) await ctx.db.delete(row._id);
  const challenge = randomChallenge();
  const id = await ctx.db.insert("authChallenges", {
    purpose,
    challenge,
    userId,
    expiresAt: now + CHALLENGE_TTL_MS,
    createdAt: now,
  });
  return { challengeId: String(id), challenge };
}

export const issueChallenge = internalMutation({
  args: { purpose: v.string(), userId: v.optional(v.string()) },
  handler: async (ctx, args) => issue(ctx, args.purpose as ChallengePurpose, args.userId),
});

/** Single use: marks the challenge used in the same transaction that reads it. */
export const consumeChallenge = internalMutation({
  args: { challengeId: v.string(), purpose: v.string(), userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("authChallenges", args.challengeId);
    const row = id ? await ctx.db.get(id) : null;
    const now = Date.now();
    if (!row || !challengeUsable(row, { purpose: args.purpose as ChallengePurpose, userId: args.userId, now })) {
      throw new Error(CHALLENGE_INVALID);
    }
    await ctx.db.patch(row._id, { usedAt: now });
    return row.challenge;
  },
});

export const credentialById = internalQuery({
  args: { credentialId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("deviceCredentials")
      .withIndex("by_credential", (q) => q.eq("credentialId", args.credentialId))
      .unique();
    return row
      ? {
          _id: String(row._id),
          userId: row.userId,
          kind: row.kind,
          publicKey: row.publicKey,
          counter: row.counter ?? 0,
          active: row.active,
        }
      : null;
  },
});

export const touchCredential = internalMutation({
  args: { id: v.string(), counter: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("deviceCredentials", args.id);
    if (!id) return;
    await ctx.db.patch(id, { lastUsedAt: Date.now(), ...(args.counter !== undefined ? { counter: args.counter } : {}) });
  },
});

/** Active, unlocked, no pending password change: the only users who may add a sign-in method. */
export const registrant = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("users", args.userId);
    const user = id ? await ctx.db.get(id) : null;
    if (!user || user.status !== "active") throw new Error("USER_NOT_ACTIVE");
    if (user.loginLockedAt) throw new Error("ACCOUNT_LOCKED");
    if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
    const existing = await ctx.db
      .query("deviceCredentials")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return {
      email: user.email || "",
      name: String(user.name || "").trim() || user.email || "",
      activeCount: existing.filter((row) => row.active).length,
      passkeyIds: existing.filter((row) => row.active && row.kind === "passkey").map((row) => row.credentialId),
    };
  },
});

export const insertCredential = internalMutation({
  args: {
    userId: v.string(),
    kind: v.string(),
    credentialId: v.string(),
    publicKey: v.string(),
    counter: v.optional(v.number()),
    deviceName: v.string(),
    platform: v.string(),
    replaceDeviceKeyId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("deviceCredentials")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    // Bật lại vân tay trên cùng máy: tắt khóa cũ của máy đó trước.
    if (args.replaceDeviceKeyId) {
      const old = rows.find((row) => row.credentialId === args.replaceDeviceKeyId && row.kind === "device_key");
      if (old?.active) await ctx.db.patch(old._id, { active: false, revokedAt: now, revokedReason: "replaced" });
    }
    const active = rows.filter((row) => row.active && row.credentialId !== args.replaceDeviceKeyId);
    if (active.length >= MAX_DEVICE_CREDENTIALS_PER_USER) throw new Error(DEVICE_CREDENTIAL_LIMIT);
    const clash = await ctx.db
      .query("deviceCredentials")
      .withIndex("by_credential", (q) => q.eq("credentialId", args.credentialId))
      .unique();
    if (clash) throw new Error(DEVICE_CREDENTIAL_INVALID);
    await ctx.db.insert("deviceCredentials", {
      userId: args.userId,
      kind: args.kind,
      credentialId: args.credentialId,
      publicKey: args.publicKey,
      counter: args.counter,
      deviceName: args.deviceName,
      platform: args.platform,
      active: true,
      createdAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: args.userId,
      action: `deviceAuth.register.${args.kind}`,
      details: JSON.stringify({ platform: args.platform, deviceName: args.deviceName }),
      at: now,
    });
  },
});

/** Called when an admin resets / the forgot-password flow rotates a user's password. */
export const revokeAllForUser = internalMutation({
  args: { userId: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("deviceCredentials")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    let revoked = 0;
    for (const row of rows) {
      if (!row.active) continue;
      await ctx.db.patch(row._id, { active: false, revokedAt: now, revokedReason: args.reason });
      revoked += 1;
    }
    return { revoked };
  },
});

// ------------------------------------------------------------------ public: sign-in challenges

/** Unauthenticated: a fresh challenge for vân tay / Face ID sign-in. */
export const deviceLoginChallenge = mutation({
  args: {},
  handler: async (ctx) => {
    return await issue(ctx, "device_login");
  },
});

/** Unauthenticated: WebAuthn request options for passkey sign-in (discoverable credentials). */
export const passkeyLoginOptions = action({
  args: {},
  handler: async (ctx): Promise<{ challengeId: string; options: string }> => {
    const { challengeId, challenge }: { challengeId: string; challenge: string } = await ctx.runMutation(internal.deviceAuth.issueChallenge, { purpose: "passkey_login" });
    const options: unknown = await ctx.runAction(internal.deviceAuthNode.passkeyAuthenticationOptions, { rpId: rpId(), challenge });
    return { challengeId, options: JSON.stringify(options) };
  },
});

// ------------------------------------------------------------------ public: registration (signed in)

async function signedInUserId(ctx: { auth: any }) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("UNAUTHENTICATED");
  return String(userId);
}

export const deviceRegisterChallenge = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await currentUserOrThrow(ctx);
    if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
    if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
    return await issue(ctx, "device_register", String(user._id));
  },
});

/**
 * Bật vân tay / Face ID: the app sends the public key of its biometric-protected key and a
 * signature over the registration challenge (proof the key works on this device).
 */
export const registerDeviceKey = action({
  args: {
    challengeId: v.string(),
    publicKey: v.string(),
    signature: v.string(),
    deviceName: v.string(),
    platform: v.string(),
    replaceCredentialId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await signedInUserId(ctx);
    const platform = assertPlatform(args.platform);
    await ctx.runQuery(internal.deviceAuth.registrant, { userId });
    const publicKey = normalizeP256PublicKey(args.publicKey);
    const challenge = await ctx.runMutation(internal.deviceAuth.consumeChallenge, {
      challengeId: args.challengeId,
      purpose: "device_register",
      userId,
    });
    const ok = await ctx.runAction(internal.deviceAuthNode.verifyDeviceSignature, {
      publicKey,
      message: deviceSignedMessage("device_register", args.challengeId, challenge),
      signature: args.signature,
    });
    if (!ok) throw new Error(DEVICE_SIGNATURE_INVALID);
    const credentialId = randomChallenge();
    await ctx.runMutation(internal.deviceAuth.insertCredential, {
      userId,
      kind: "device_key",
      credentialId,
      publicKey,
      deviceName: cleanDeviceName(args.deviceName),
      platform,
      replaceDeviceKeyId: args.replaceCredentialId,
    });
    return { credentialId };
  },
});

export const passkeyRegistrationOptions = action({
  args: {},
  handler: async (ctx): Promise<{ challengeId: string; options: string }> => {
    const userId = await signedInUserId(ctx);
    const info: { email: string; name: string; passkeyIds: string[] } = await ctx.runQuery(internal.deviceAuth.registrant, { userId });
    const { challengeId, challenge }: { challengeId: string; challenge: string } = await ctx.runMutation(internal.deviceAuth.issueChallenge, {
      purpose: "passkey_register",
      userId,
    });
    const options: unknown = await ctx.runAction(internal.deviceAuthNode.passkeyRegistrationOptions, {
      rpId: rpId(),
      challenge,
      userId,
      userName: info.email,
      userDisplayName: info.name,
      excludeCredentialIds: info.passkeyIds,
    });
    return { challengeId, options: JSON.stringify(options) };
  },
});

export const registerPasskey = action({
  args: { challengeId: v.string(), response: v.string(), deviceName: v.string(), platform: v.string() },
  handler: async (ctx, args): Promise<{ credentialId: string }> => {
    const userId = await signedInUserId(ctx);
    const platform = assertPlatform(args.platform);
    await ctx.runQuery(internal.deviceAuth.registrant, { userId });
    if (args.response.length > 20_000) throw new Error(PASSKEY_VERIFICATION_FAILED);
    const challenge: string = await ctx.runMutation(internal.deviceAuth.consumeChallenge, {
      challengeId: args.challengeId,
      purpose: "passkey_register",
      userId,
    });
    const verified: { credentialId: string; publicKey: string; counter: number } | null = await ctx.runAction(internal.deviceAuthNode.verifyPasskeyRegistration, {
      response: args.response,
      challenge,
      rpId: rpId(),
      origins: origins(),
    });
    if (!verified) throw new Error(PASSKEY_VERIFICATION_FAILED);
    await ctx.runMutation(internal.deviceAuth.insertCredential, {
      userId,
      kind: "passkey",
      credentialId: verified.credentialId,
      publicKey: verified.publicKey,
      counter: verified.counter,
      deviceName: cleanDeviceName(args.deviceName),
      platform,
    });
    return { credentialId: verified.credentialId };
  },
});

// ------------------------------------------------------------------ public: manage own

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUserOrThrow(ctx);
    const rows = await ctx.db
      .query("deviceCredentials")
      .withIndex("by_user", (q) => q.eq("userId", String(user._id)))
      .collect();
    return rows
      .filter((row) => row.active)
      .map((row) => ({
        _id: String(row._id),
        kind: row.kind,
        credentialId: row.credentialId,
        deviceName: row.deviceName,
        platform: row.platform,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt ?? null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const removeMine = mutation({
  args: { id: v.optional(v.string()), credentialId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await currentUserOrThrow(ctx);
    let row = null;
    if (args.id) {
      const id = ctx.db.normalizeId("deviceCredentials", args.id);
      row = id ? await ctx.db.get(id) : null;
    } else if (args.credentialId) {
      row = await ctx.db
        .query("deviceCredentials")
        .withIndex("by_credential", (q) => q.eq("credentialId", args.credentialId!))
        .unique();
    }
    if (!row || row.userId !== String(user._id)) throw new Error("DEVICE_CREDENTIAL_NOT_FOUND");
    if (!row.active) return;
    const now = Date.now();
    await ctx.db.patch(row._id as Id<"deviceCredentials">, { active: false, revokedAt: now, revokedReason: "owner" });
    await ctx.db.insert("auditLogs", {
      actorUserId: String(user._id),
      action: `deviceAuth.remove.${row.kind}`,
      details: JSON.stringify({ platform: row.platform, deviceName: row.deviceName }),
      at: now,
    });
  },
});
