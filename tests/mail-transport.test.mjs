import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agentMailFailureCode,
  buildAgentMailSendRequest,
  readAgentMailConfig,
} from '../convex/mailTransport.ts';

test('missing AgentMail settings fail as MAIL_NOT_CONFIGURED', () => {
  assert.throws(() => readAgentMailConfig({}), /MAIL_NOT_CONFIGURED/);
  assert.throws(() => readAgentMailConfig({ AGENTMAIL_API_KEY: 'k' }), /MAIL_NOT_CONFIGURED/);
  assert.throws(
    () => readAgentMailConfig({ AGENTMAIL_API_KEY: '  ', AGENTMAIL_INBOX_ID: 'a@agentmail.to' }),
    /MAIL_NOT_CONFIGURED/,
  );
});

test('config values are trimmed', () => {
  assert.deepEqual(
    readAgentMailConfig({ AGENTMAIL_API_KEY: ' key \n', AGENTMAIL_INBOX_ID: ' a@agentmail.to ' }),
    { apiKey: 'key', inboxId: 'a@agentmail.to' },
  );
});

test('send request targets the inbox with bearer auth and plain text body', () => {
  const { url, init } = buildAgentMailSendRequest(
    { apiKey: 'secret-key', inboxId: 'school@agentmail.to' },
    { to: 'teacher@example.school', subject: 'Mật khẩu tạm', text: 'Xin chào' },
  );
  assert.equal(url, 'https://api.agentmail.to/v0/inboxes/school%40agentmail.to/messages/send');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer secret-key');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(init.body), {
    to: ['teacher@example.school'],
    subject: 'Mật khẩu tạm',
    text: 'Xin chào',
  });
  assert.ok(!url.includes('secret-key'));
});

test('auth failures map to MAIL_AUTH_FAILED, others keep the caller code', () => {
  assert.equal(agentMailFailureCode(401, 'PASSWORD_RESET_EMAIL_FAILED'), 'MAIL_AUTH_FAILED');
  assert.equal(agentMailFailureCode(403, 'PASSWORD_RESET_EMAIL_FAILED'), 'MAIL_AUTH_FAILED');
  assert.equal(agentMailFailureCode(400, 'PASSWORD_RESET_EMAIL_FAILED'), 'PASSWORD_RESET_EMAIL_FAILED');
  assert.equal(agentMailFailureCode(500, 'ACCOUNT_LOCKED_EMAIL_FAILED'), 'ACCOUNT_LOCKED_EMAIL_FAILED');
});
