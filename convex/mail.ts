"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import {
  agentMailFailureCode,
  buildAgentMailSendRequest,
  readAgentMailConfig,
} from "./mailTransport";

async function sendViaAgentMail(
  message: { to: string; subject: string; text: string },
  failureCode: string,
): Promise<void> {
  const config = readAgentMailConfig(process.env);
  const { url, init } = buildAgentMailSendRequest(config, message);
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error(failureCode);
  }
  if (!response.ok) {
    throw new Error(agentMailFailureCode(response.status, failureCode));
  }
}

export const sendPasswordResetEmail = internalAction({
  args: {
    to: v.string(),
    temporaryPassword: v.string(),
    recipientName: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const greeting = args.recipientName?.trim()
      ? `Xin chào ${args.recipientName.trim()},`
      : "Xin chào,";
    const text = [
      greeting,
      "",
      "Bạn (hoặc ai đó) đã yêu cầu khôi phục mật khẩu cho tài khoản Lê Văn Tám CRM.",
      "",
      `Mật khẩu tạm thời của bạn là: ${args.temporaryPassword}`,
      "",
      "Hãy đăng nhập bằng mật khẩu tạm, hệ thống sẽ yêu cầu bạn tạo mật khẩu mới ngay.",
      "Nếu bạn không yêu cầu, hãy liên hệ quản trị viên và đổi mật khẩu ngay khi có thể.",
      "",
      "Trân trọng,",
      "THCS Lê Văn Tám",
    ].join("\n");

    await sendViaAgentMail(
      { to: args.to, subject: "Mật khẩu tạm — Lê Văn Tám CRM", text },
      "PASSWORD_RESET_EMAIL_FAILED",
    );
    return { ok: true as const };
  },
});

export const sendAccountLockedEmail = internalAction({
  args: {
    to: v.string(),
    recipientName: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const greeting = args.recipientName?.trim()
      ? `Xin chào ${args.recipientName.trim()},`
      : "Xin chào,";
    const text = [
      greeting,
      "",
      "Tài khoản Lê Văn Tám CRM của bạn đã bị tạm khóa do đăng nhập sai quá số lần cho phép.",
      "",
      "Vui lòng liên hệ quản trị viên của nhà trường để được mở khóa tài khoản.",
      "Không thử đăng nhập lại cho đến khi quản trị viên xác nhận đã mở khóa.",
      "",
      "Trân trọng,",
      "THCS Lê Văn Tám",
    ].join("\n");

    await sendViaAgentMail(
      { to: args.to, subject: "Tài khoản bị khóa — Lê Văn Tám CRM", text },
      "ACCOUNT_LOCKED_EMAIL_FAILED",
    );
    return { ok: true as const };
  },
});
