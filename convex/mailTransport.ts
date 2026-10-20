/**
 * Transactional mail through AgentMail (https://docs.agentmail.to).
 * Pure helpers so the request shape and error mapping can be unit-tested
 * without the Convex runtime; `mail.ts` performs the actual fetch.
 */

export const AGENTMAIL_API_BASE = "https://api.agentmail.to";

export type AgentMailConfig = {
  apiKey: string;
  inboxId: string;
};

type Env = Record<string, string | undefined>;

export function readAgentMailConfig(env: Env): AgentMailConfig {
  const apiKey = env.AGENTMAIL_API_KEY?.trim() ?? "";
  const inboxId = env.AGENTMAIL_INBOX_ID?.trim() ?? "";
  if (!apiKey || !inboxId) {
    throw new Error("MAIL_NOT_CONFIGURED");
  }
  return { apiKey, inboxId };
}

export function buildAgentMailSendRequest(
  config: AgentMailConfig,
  message: { to: string; subject: string; text: string },
): { url: string; init: { method: "POST"; headers: Record<string, string>; body: string } } {
  return {
    url: `${AGENTMAIL_API_BASE}/v0/inboxes/${encodeURIComponent(config.inboxId)}/messages/send`,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    },
  };
}

/** Maps an AgentMail HTTP status to the error code callers already understand. */
export function agentMailFailureCode(status: number, fallback: string): string {
  return status === 401 || status === 403 ? "MAIL_AUTH_FAILED" : fallback;
}
