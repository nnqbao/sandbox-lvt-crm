/** Pure helpers of the app → WebView sign-in handoff (convex/appHandoff.ts, provider in convex/auth.ts). */
export const APP_HANDOFF_TTL_MS = 60 * 1000;
export const APP_HANDOFF_INVALID = "APP_HANDOFF_INVALID";
const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isAppHandoffCode(code: unknown): code is string {
  return typeof code === "string" && CODE_PATTERN.test(code);
}

export async function appHandoffCodeHash(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function newAppHandoffCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
