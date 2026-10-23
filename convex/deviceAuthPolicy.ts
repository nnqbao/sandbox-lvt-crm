/**
 * Pure rules for vân tay / Face ID (device key) and passkey sign-in.
 * No Convex imports: tests load this file directly.
 *
 * Device key: the app creates a P-256 key inside the Secure Enclave / Android Keystore that
 * can only be used after a biometric check, registers the PUBLIC key while signed in, and later
 * proves possession by signing a single-use server challenge. Nothing secret leaves the device.
 * Passkey: standard WebAuthn (discoverable credential), verified with @simplewebauthn/server.
 */

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const MAX_DEVICE_CREDENTIALS_PER_USER = 10;

export const CHALLENGE_PURPOSES = ["device_login", "device_register", "passkey_login", "passkey_register"] as const;
export type ChallengePurpose = (typeof CHALLENGE_PURPOSES)[number];
export const CREDENTIAL_KINDS = ["device_key", "passkey"] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];
export const PLATFORMS = ["ios", "android"] as const;

export const CHALLENGE_INVALID = "CHALLENGE_INVALID";
export const DEVICE_CREDENTIAL_INVALID = "DEVICE_CREDENTIAL_INVALID";
export const DEVICE_SIGNATURE_INVALID = "DEVICE_SIGNATURE_INVALID";
export const PASSKEY_VERIFICATION_FAILED = "PASSKEY_VERIFICATION_FAILED";
export const DEVICE_CREDENTIAL_LIMIT = "DEVICE_CREDENTIAL_LIMIT";
export const INVALID_PUBLIC_KEY = "INVALID_PUBLIC_KEY";

/** Default relying party (prod web domain). Override with PASSKEY_RP_ID on the deployment. */
export const DEFAULT_RP_ID = "lvt.vscgroup.io.vn";
export const RP_NAME = "CRM Lê Văn Tám";

/**
 * Origins accepted in WebAuthn clientDataJSON:
 * - iOS native passkeys report the web origin of the associated domain;
 * - Android native passkeys report `android:apk-key-hash:<base64url SHA-256 of the signing cert>`.
 * The Android hash below is the release/upload certificate (public). Google Play app-signing
 * certificates are added through PASSKEY_EXTRA_ORIGINS (comma separated) without a code change.
 */
export const ANDROID_RELEASE_ORIGIN = "android:apk-key-hash:NKTWMaWP6td8UkHgw4yXSYoGAcHAfj2aDjkLhPKUmEQ";

export function passkeyOrigins(rpId: string, extra = ""): string[] {
  const list = [`https://${rpId}`, ANDROID_RELEASE_ORIGIN];
  for (const item of String(extra || "").split(",")) {
    const origin = item.trim();
    if (origin && /^(https:\/\/[a-z0-9.-]+|android:apk-key-hash:[A-Za-z0-9_-]{43})$/.test(origin)) list.push(origin);
  }
  return [...new Set(list)];
}

/** Exact bytes the device signs: domain-separated so a login signature can't register a key. */
export function deviceSignedMessage(purpose: "device_login" | "device_register", challengeId: string, challenge: string): string {
  return `lvt-crm:${purpose}:${challengeId}:${challenge}`;
}

export function assertPurpose(value: string): ChallengePurpose {
  if (!(CHALLENGE_PURPOSES as readonly string[]).includes(value)) throw new Error(CHALLENGE_INVALID);
  return value as ChallengePurpose;
}

/** A stored challenge may be consumed once, for the expected purpose, before it expires. */
export function challengeUsable(
  row: { purpose: string; expiresAt: number; usedAt?: number; userId?: string } | null | undefined,
  expected: { purpose: ChallengePurpose; userId?: string; now: number },
): boolean {
  if (!row || row.usedAt) return false;
  if (row.purpose !== expected.purpose) return false;
  if (row.expiresAt < expected.now) return false;
  if (expected.userId !== undefined && row.userId !== expected.userId) return false;
  return true;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64Decode(value: string): Uint8Array {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) throw new Error(INVALID_PUBLIC_KEY);
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** DER prefix of a SubjectPublicKeyInfo for an uncompressed P-256 point (id-ecPublicKey, prime256v1). */
const P256_SPKI_PREFIX = Uint8Array.from([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
  0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);

/**
 * Normalise a device public key to base64 SPKI DER (P-256 only).
 * Android `PublicKey.getEncoded()` already is SPKI; iOS `SecKeyCopyExternalRepresentation`
 * returns the raw 65-byte X9.63 point (0x04 || X || Y), which we wrap.
 */
export function normalizeP256PublicKey(input: string): string {
  const bytes = base64Decode(input);
  let spki: Uint8Array;
  if (bytes.length === 65 && bytes[0] === 0x04) {
    spki = new Uint8Array(P256_SPKI_PREFIX.length + 65);
    spki.set(P256_SPKI_PREFIX, 0);
    spki.set(bytes, P256_SPKI_PREFIX.length);
  } else if (bytes.length === 91 && P256_SPKI_PREFIX.every((value, index) => bytes[index] === value) && bytes[26] === 0x04) {
    spki = bytes;
  } else {
    throw new Error(INVALID_PUBLIC_KEY);
  }
  let binary = "";
  for (const byte of spki) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function cleanDeviceName(value: unknown): string {
  const name = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return name || "Thiết bị";
}

export function assertPlatform(value: unknown): "ios" | "android" {
  if (value !== "ios" && value !== "android") throw new Error("INVALID_PLATFORM");
  return value;
}
