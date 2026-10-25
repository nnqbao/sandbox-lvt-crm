import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('app handoff codes: 256-bit url-safe, only the SHA-256 is stored', async () => {
  const { appHandoffCodeHash, isAppHandoffCode, newAppHandoffCode, APP_HANDOFF_TTL_MS } = await import('../convex/appHandoffCode.ts');
  const codes = new Set(Array.from({ length: 50 }, () => newAppHandoffCode()));
  assert.equal(codes.size, 50);
  for (const code of codes) assert.ok(isAppHandoffCode(code), code);
  const code = [...codes][0];
  assert.equal(await appHandoffCodeHash(code), createHash('sha256').update(code).digest('hex'));
  for (const bad of ['', 'short', `${code}x`, code.replace(/^./, '+'), 42, null]) assert.equal(isAppHandoffCode(bad), false, String(bad));
  assert.equal(APP_HANDOFF_TTL_MS, 60_000);
});

test('app handoff: issued only to a usable signed-in account, single-use, and a separate session', () => {
  const source = read('convex/appHandoff.ts');
  assert.match(source, /export const issue = action\(/);
  assert.doesNotMatch(source, /export const \w+ = (mutation|query)\(/, 'store / consume stay internal');
  assert.match(source, /const user = await currentUserOrThrow\(ctx\);\n\s+if \(user\.status !== "active"\) throw new Error\("USER_NOT_ACTIVE"\);\n\s+if \(user\.mustChangePassword\) throw new Error\("PASSWORD_CHANGE_REQUIRED"\);/);
  assert.match(source, /codeHash: args\.codeHash, createdAt: now, expiresAt: now \+ APP_HANDOFF_TTL_MS/);
  // Consumed (deleted) before the expiry check, so a code can never be tried twice.
  assert.match(source, /if \(!row\) return null;\n\s+await ctx\.db\.delete\(row\._id\);\n\s+return row\.expiresAt > Date\.now\(\) \? row\.userId : null;/);
  const auth = read('convex/auth.ts');
  assert.match(auth, /id: "app-handoff",/);
  assert.match(auth, /if \(!isAppHandoffCode\(code\)\) throw new ConvexError\(APP_HANDOFF_INVALID\);/);
  assert.match(auth, /providers: \[PasswordSignInOnly, DeviceKeySignIn, PasskeySignIn, AppHandoffSignIn\]/);
  // beforeSessionCreation still rejects inactive / locked accounts for every provider.
  assert.match(auth, /if \(user\.loginLockedAt\) throw new Error\("ACCOUNT_LOCKED"\);/);
  const schema = read('convex/schema.ts');
  assert.match(schema, /appWebHandoffs: defineTable\(\{\n\s+userId: v\.id\("users"\),\n\s+codeHash: v\.string\(\),/);
  assert.match(schema, /\.index\("by_code_hash", \["codeHash"\]\)/);
});

test('web bridge: no-op in a browser; a handoff reply must match its request', async () => {
  const sent = [];
  const timers = new Map();
  let nextTimer = 1;
  globalThis.window = {
    LvtApp: { postMessage: (text) => sent.push(JSON.parse(text)) },
    setTimeout: (fn) => {
      const id = nextTimer++;
      timers.set(id, fn);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const bridge = await import(`../src/lib/appBridge.js?case=${Date.now()}`);
  assert.equal(bridge.isInApp(), true);
  const pending = bridge.requestAppHandoff();
  assert.equal(sent.at(-1).type, 'handoff-request');
  const { id } = sent.at(-1);
  bridge.receiveAppMessage(JSON.stringify({ type: 'handoff', id: id + 1, code: 'other' }));
  bridge.receiveAppMessage('not json');
  bridge.receiveAppMessage(JSON.stringify({ type: 'handoff', id, code: 'mine' }));
  assert.equal(await pending, 'mine');

  const failed = bridge.requestAppHandoff();
  bridge.receiveAppMessage({ type: 'handoff-failed', id: sent.at(-1).id });
  assert.equal(await failed, null);

  const timedOut = bridge.requestAppHandoff();
  [...timers.values()].at(-1)();
  assert.equal(await timedOut, null);

  assert.equal(bridge.appSignOutRequested(), false);
  bridge.markAppSignOut();
  assert.equal(bridge.appSignOutRequested(), true);
  delete globalThis.window;

  const browser = await import(`../src/lib/appBridge.js?case=browser-${Date.now()}`);
  assert.equal(browser.isInApp(), false);
  assert.equal(browser.postToApp({ type: 'ready' }), false);
});

test('web in the app shell: native sign-in, sign-out goes back to the app, files and notifications go to the app', () => {
  const main = read('src/main.jsx');
  assert.match(main, /<Unauthenticated>\{isInApp\(\) \? <AppHandoffView \/> : <SignedOutView \/>\}<\/Unauthenticated>/);
  assert.match(main, /await signIn\('app-handoff', \{ code \}\);/);
  assert.equal((main.match(/markAppSignOut\(\);\n\s+void signOut\(\);/g) || []).length, 4, 'menu, password gate, access denied, app-initiated');
  assert.match(main, /if \(!session\?\.user \|\| session\.user\.status !== 'active' \|\| isInApp\(\)\) return;/);
  assert.match(main, /message\.type === 'open-notification' && message\.item\?\.sourceId\) openFromNotificationRef\.current\(message\.item\)/);
  assert.match(main, /installAppBridge\(\);\ncreateRoot/);
  const bridge = read('src/lib/appBridge.js');
  assert.match(bridge, /if \(!anchor\.hasAttribute\('download'\) \|\| !\/\^\(blob:\|data:\)\/\.test\(href\)\) return false;/);
  assert.match(bridge, /if \(installed \|\| !isInApp\(\)\) return;/, 'browsers keep their normal downloads');
  assert.doesNotMatch(bridge, /localStorage|__convexAuth|fetchAccessToken/, 'the bridge never touches tokens');
  assert.match(read('src/work/WorkViews.jsx'), /if \(action === 'preview' && kind === 'pdf' && isInApp\(\)\) \{\n\s+await sendBlobToApp\(blob, fileName \|\| 'cong-van\.pdf', 'open'\);/);
  assert.match(read('src/profile/DevicesPanel.jsx'), /\{isInApp\(\) \? \(\n\s+<button type="button" className="primary-button devices-quick-sign-in" onClick=\{\(\) => postToApp\(\{ type: 'quick-sign-in' \}\)\}>/);
});
