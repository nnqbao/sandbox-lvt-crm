import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as policy from '../convex/deviceAuthPolicy.ts';
import { appleAppSiteAssociation, assetLinks, wellKnownResponse } from '../scripts/lib/well-known.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('device public keys: iOS raw X9.63 point and Android SPKI normalise to the same SPKI', () => {
  const point = Buffer.concat([Buffer.from([4]), Buffer.alloc(32, 1), Buffer.alloc(32, 2)]);
  const spki = policy.normalizeP256PublicKey(point.toString('base64'));
  assert.equal(Buffer.from(spki, 'base64').length, 91);
  assert.equal(policy.normalizeP256PublicKey(spki), spki);
  assert.throws(() => policy.normalizeP256PublicKey(Buffer.alloc(33, 2).toString('base64')), /INVALID_PUBLIC_KEY/);
  assert.throws(() => policy.normalizeP256PublicKey('not base64 !!'), /INVALID_PUBLIC_KEY/);
});

test('challenges are single use, purpose-bound, user-bound and expire', () => {
  const now = 1_000_000;
  const row = { purpose: 'device_login', expiresAt: now + 10, userId: undefined };
  assert.equal(policy.challengeUsable(row, { purpose: 'device_login', now }), true);
  assert.equal(policy.challengeUsable({ ...row, usedAt: now - 1 }, { purpose: 'device_login', now }), false);
  assert.equal(policy.challengeUsable(row, { purpose: 'passkey_login', now }), false);
  assert.equal(policy.challengeUsable({ ...row, expiresAt: now - 1 }, { purpose: 'device_login', now }), false);
  const reg = { purpose: 'device_register', expiresAt: now + 10, userId: 'u1' };
  assert.equal(policy.challengeUsable(reg, { purpose: 'device_register', userId: 'u1', now }), true);
  assert.equal(policy.challengeUsable(reg, { purpose: 'device_register', userId: 'u2', now }), false);
  assert.notEqual(
    policy.deviceSignedMessage('device_login', 'c1', 'x'),
    policy.deviceSignedMessage('device_register', 'c1', 'x'),
    'a login signature can never register a key',
  );
});

test('passkey origins: web origin + Android release hash; extra origins validated', () => {
  const list = policy.passkeyOrigins('lvt.vscgroup.io.vn', `android:apk-key-hash:${'A'.repeat(43)}, javascript:alert(1), https://evil.example`);
  assert.ok(list.includes('https://lvt.vscgroup.io.vn'));
  assert.ok(list.includes(policy.ANDROID_RELEASE_ORIGIN));
  assert.ok(list.includes(`android:apk-key-hash:${'A'.repeat(43)}`));
  assert.ok(!list.includes('javascript:alert(1)'));
  assert.ok(list.includes('https://evil.example'), 'explicit https origins configured by the operator are allowed');
});

test('domain association files for iOS and Android passkeys', () => {
  assert.deepEqual(appleAppSiteAssociation(), { webcredentials: { apps: ['42ZDDJ2B8M.vn.lvt.crm.uikit'] } });
  const links = assetLinks('ab:'.repeat(31) + 'ab, junk');
  assert.ok(links[0].relation.includes('delegate_permission/common.get_login_creds'));
  assert.equal(links[0].target.package_name, 'lvt.crm');
  assert.equal(links[0].target.sha256_cert_fingerprints.length, 2);
  assert.equal(wellKnownResponse('/.well-known/nothing'), null);
  assert.match(read('scripts/serve-production.mjs'), /wellKnownResponse\(pathname\)/);
});

test('server: providers registered, sessions gated, registration needs a ready signed-in user', () => {
  const auth = read('convex/auth.ts');
  assert.match(auth, /providers: \[PasswordSignInOnly, DeviceKeySignIn, PasskeySignIn\]/);
  assert.match(auth, /beforeSessionCreation[\s\S]*USER_NOT_ACTIVE[\s\S]*ACCOUNT_LOCKED/);
  assert.match(auth, /credential\.kind !== "device_key"/);
  assert.match(auth, /credential\.kind !== "passkey"/);
  const device = read('convex/deviceAuth.ts');
  for (const name of ['registerDeviceKey', 'passkeyRegistrationOptions', 'registerPasskey']) {
    assert.match(device, new RegExp(`export const ${name} = action\\(\\{[\\s\\S]*?signedInUserId\\(ctx\\)[\\s\\S]*?internal\\.deviceAuth\\.registrant`));
  }
  assert.match(device, /if \(user\.mustChangePassword\) throw new Error\("PASSWORD_CHANGE_REQUIRED"\)/);
  assert.match(device, /row\.userId !== String\(user\._id\)/, 'owners only remove their own keys');
  const node = read('convex/deviceAuthNode.ts');
  assert.match(node, /requireUserVerification: true/);
  assert.match(node, /userVerification: "required"/);
});

test('password resets, disable and removal revoke every biometric key and passkey', () => {
  const users = read('convex/users.ts');
  for (const reason of ['password_reset', 'account_disabled', 'account_removed']) {
    assert.match(users, new RegExp(`internal\\.deviceAuth\\.revokeAllForUser, \\{ userId: [^}]+reason: "${reason}"`));
  }
});
