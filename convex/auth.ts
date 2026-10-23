import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth, retrieveAccount } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { Scrypt } from "lucia";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  DEFAULT_RP_ID,
  DEVICE_CREDENTIAL_INVALID,
  DEVICE_SIGNATURE_INVALID,
  deviceSignedMessage,
  PASSKEY_VERIFICATION_FAILED,
  passkeyOrigins,
} from "./deviceAuthPolicy";

const passkeyRpId = () => process.env.PASSKEY_RP_ID || DEFAULT_RP_ID;
const passkeyAllowedOrigins = () => passkeyOrigins(passkeyRpId(), process.env.PASSKEY_EXTRA_ORIGINS || "");

function normalizeEmail(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

/**
 * Password sign-in only, with SYS-008 lockout:
 * - reject locked / inactive accounts before credential check
 * - count failures and lock after configured threshold
 * - public sign-up / reset / email-verify remain disabled
 */
const PasswordSignInOnly = ConvexCredentials({
  id: "password",
  authorize: async (params, ctx) => {
    const flow = String(params.flow ?? "");
    if (flow === "signUp") throw new Error("PUBLIC_SIGNUP_DISABLED");
    if (flow === "reset" || flow === "reset-verification") throw new Error("PASSWORD_RESET_DISABLED");
    if (flow === "email-verification") throw new Error("EMAIL_VERIFICATION_DISABLED");
    if (flow !== "signIn") throw new Error("INVALID_AUTH_FLOW");

    const email = normalizeEmail(params.email);
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
      throw new Error("INVALID_EMAIL");
    }
    const secret = params.password;
    if (typeof secret !== "string" || !secret) {
      throw new Error("Invalid credentials");
    }
    if (secret.length < 8) throw new Error("PASSWORD_TOO_SHORT");

    const lockStatus = await ctx.runQuery(internal.loginSecurity.lockStatusByEmail, { email });
    if (lockStatus.loginLocked) throw new Error("ACCOUNT_LOCKED");
    if (lockStatus.locked) throw new Error("USER_NOT_ACTIVE");

    try {
      const retrieved = await retrieveAccount(ctx, {
        provider: "password",
        account: { id: email, secret },
      });
      if (retrieved === null) {
        const result = await ctx.runMutation(internal.loginSecurity.recordFailure, { email });
        if (result.locked || result.newlyLocked) throw new ConvexError("ACCOUNT_LOCKED");
        throw new ConvexError("INVALID_CREDENTIALS");
      }
      await ctx.runMutation(internal.loginSecurity.clearFailures, { email });
      return { userId: retrieved.user._id };
    } catch (error) {
      const raw = errorMessage(error);
      if (
        raw.includes("InvalidSecret") ||
        raw.includes("InvalidAccountId") ||
        raw.includes("TooManyFailedAttempts")
      ) {
        const result = await ctx.runMutation(internal.loginSecurity.recordFailure, { email });
        if (result.locked || result.newlyLocked) throw new ConvexError("ACCOUNT_LOCKED");
        throw new ConvexError("INVALID_CREDENTIALS");
      }
      throw error;
    }
  },
  crypto: {
    async hashSecret(password: string) {
      return await new Scrypt().hash(password);
    },
    async verifySecret(password: string, hash: string) {
      return await new Scrypt().verify(hash, password);
    },
  },
});

/**
 * Vân tay / Face ID: the device signs a single-use `device_login` challenge with its
 * biometric-protected P-256 key (registered earlier while signed in with a password).
 */
const DeviceKeySignIn = ConvexCredentials({
  id: "device-key",
  authorize: async (params, ctx) => {
    const credentialId = String(params.credentialId ?? "");
    const challengeId = String(params.challengeId ?? "");
    const signature = String(params.signature ?? "");
    if (!credentialId || !challengeId || !signature || signature.length > 512) throw new ConvexError(DEVICE_CREDENTIAL_INVALID);
    const credential = await ctx.runQuery(internal.deviceAuth.credentialById, { credentialId });
    // Consume first so a challenge can never be retried, even after a failed check.
    const challenge = await ctx.runMutation(internal.deviceAuth.consumeChallenge, { challengeId, purpose: "device_login" });
    if (!credential || !credential.active || credential.kind !== "device_key") throw new ConvexError(DEVICE_CREDENTIAL_INVALID);
    const ok = await ctx.runAction(internal.deviceAuthNode.verifyDeviceSignature, {
      publicKey: credential.publicKey,
      message: deviceSignedMessage("device_login", challengeId, challenge),
      signature,
    });
    if (!ok) throw new ConvexError(DEVICE_SIGNATURE_INVALID);
    await ctx.runMutation(internal.deviceAuth.touchCredential, { id: credential._id });
    return { userId: credential.userId as Id<"users"> };
  },
});

/** Passkey (WebAuthn assertion of a discoverable credential), from the Android / iOS app. */
const PasskeySignIn = ConvexCredentials({
  id: "passkey",
  authorize: async (params, ctx) => {
    const challengeId = String(params.challengeId ?? "");
    const response = String(params.response ?? "");
    if (!challengeId || !response || response.length > 20_000) throw new ConvexError(PASSKEY_VERIFICATION_FAILED);
    let credentialId = "";
    try {
      credentialId = String(JSON.parse(response).id ?? "");
    } catch {
      throw new ConvexError(PASSKEY_VERIFICATION_FAILED);
    }
    const challenge = await ctx.runMutation(internal.deviceAuth.consumeChallenge, { challengeId, purpose: "passkey_login" });
    const credential = credentialId ? await ctx.runQuery(internal.deviceAuth.credentialById, { credentialId }) : null;
    if (!credential || !credential.active || credential.kind !== "passkey") throw new ConvexError(DEVICE_CREDENTIAL_INVALID);
    const verified = await ctx.runAction(internal.deviceAuthNode.verifyPasskeyAuthentication, {
      response,
      challenge,
      rpId: passkeyRpId(),
      origins: passkeyAllowedOrigins(),
      credentialId,
      publicKey: credential.publicKey,
      counter: credential.counter,
    });
    if (!verified) throw new ConvexError(PASSKEY_VERIFICATION_FAILED);
    await ctx.runMutation(internal.deviceAuth.touchCredential, { id: credential._id, counter: verified.newCounter });
    return { userId: credential.userId as Id<"users"> };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [PasswordSignInOnly, DeviceKeySignIn, PasskeySignIn],
  // Keep library rate-limit high so SYS-008 window/threshold is the controlling policy.
  signIn: { maxFailedAttempsPerHour: 1000 },
  callbacks: {
    async beforeSessionCreation(ctx: MutationCtx, { userId }: { userId: Id<"users"> }) {
      const user = await ctx.db.get(userId);
      if (!user || user.status !== "active") throw new Error("USER_NOT_ACTIVE");
      if (user.loginLockedAt) throw new Error("ACCOUNT_LOCKED");
    },
  },
});
