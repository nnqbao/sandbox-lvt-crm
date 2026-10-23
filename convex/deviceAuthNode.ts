"use node";
/**
 * Cryptographic checks for vân tay / Face ID (device key) and passkey sign-in.
 * Internal only: every caller (convex/deviceAuth.ts, convex/auth.ts) authorizes first.
 */
import { createPublicKey, verify } from "node:crypto";
import { v } from "convex/values";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { internalAction } from "./_generated/server";
import { RP_NAME, base64Decode, base64UrlEncode } from "./deviceAuthPolicy";

/** ECDSA P-256 / SHA-256, DER signature (iOS .ecdsaSignatureMessageX962SHA256, Android SHA256withECDSA). */
export const verifyDeviceSignature = internalAction({
  args: { publicKey: v.string(), message: v.string(), signature: v.string() },
  handler: async (_ctx, args) => {
    try {
      const key = createPublicKey({ key: Buffer.from(args.publicKey, "base64"), format: "der", type: "spki" });
      if (key.asymmetricKeyType !== "ec") return false;
      return verify("sha256", Buffer.from(args.message, "utf8"), { key, dsaEncoding: "der" }, Buffer.from(base64Decode(args.signature)));
    } catch {
      return false;
    }
  },
});

export const passkeyRegistrationOptions = internalAction({
  args: {
    rpId: v.string(),
    challenge: v.string(),
    userId: v.string(),
    userName: v.string(),
    userDisplayName: v.string(),
    excludeCredentialIds: v.array(v.string()),
  },
  handler: async (_ctx, args) => {
    return await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: args.rpId,
      userID: args.userId,
      userName: args.userName,
      userDisplayName: args.userDisplayName,
      challenge: base64Decode(args.challenge),
      timeout: 120_000,
      attestationType: "none",
      excludeCredentials: args.excludeCredentialIds.map((id) => ({ id: base64Decode(id), type: "public-key" as const })),
      authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
      supportedAlgorithmIDs: [-7, -257],
    });
  },
});

export const verifyPasskeyRegistration = internalAction({
  args: { response: v.string(), challenge: v.string(), rpId: v.string(), origins: v.array(v.string()) },
  handler: async (_ctx, args) => {
    try {
      const result = await verifyRegistrationResponse({
        response: JSON.parse(args.response),
        expectedChallenge: args.challenge,
        expectedOrigin: args.origins,
        expectedRPID: args.rpId,
        requireUserVerification: true,
      });
      if (!result.verified || !result.registrationInfo) return null;
      const info = result.registrationInfo;
      return {
        credentialId: base64UrlEncode(info.credentialID),
        publicKey: base64UrlEncode(info.credentialPublicKey),
        counter: info.counter,
      };
    } catch {
      return null;
    }
  },
});

export const passkeyAuthenticationOptions = internalAction({
  args: { rpId: v.string(), challenge: v.string() },
  handler: async (_ctx, args) => {
    // No allowCredentials: discoverable passkeys, the user picks the account on the device.
    return await generateAuthenticationOptions({
      rpID: args.rpId,
      challenge: base64Decode(args.challenge),
      timeout: 120_000,
      userVerification: "required",
    });
  },
});

export const verifyPasskeyAuthentication = internalAction({
  args: {
    response: v.string(),
    challenge: v.string(),
    rpId: v.string(),
    origins: v.array(v.string()),
    credentialId: v.string(),
    publicKey: v.string(),
    counter: v.number(),
  },
  handler: async (_ctx, args) => {
    try {
      const result = await verifyAuthenticationResponse({
        response: JSON.parse(args.response),
        expectedChallenge: args.challenge,
        expectedOrigin: args.origins,
        expectedRPID: args.rpId,
        requireUserVerification: true,
        authenticator: {
          credentialID: base64Decode(args.credentialId),
          credentialPublicKey: base64Decode(args.publicKey),
          counter: args.counter,
        },
      });
      return result.verified ? { newCounter: result.authenticationInfo.newCounter } : null;
    } catch {
      return null;
    }
  },
});
