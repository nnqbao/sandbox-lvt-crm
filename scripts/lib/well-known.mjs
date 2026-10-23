// Domain-association files that let the native apps use passkeys for lvt.vscgroup.io.vn.
// Both are public by design (app ids and signing-certificate fingerprints, no secrets).
export const IOS_APP_IDS = Object.freeze(['42ZDDJ2B8M.vn.lvt.crm.uikit']);
export const ANDROID_PACKAGE = 'lvt.crm';
/** Release/upload certificate. Google Play app-signing fingerprints: LVT_ANDROID_CERT_SHA256 (comma separated). */
export const ANDROID_CERT_SHA256 = Object.freeze([
  '34:A4:D6:31:A5:8F:EA:D7:7C:52:41:E0:C3:8C:97:49:8A:06:01:C1:C0:7E:3D:9A:0E:39:0B:84:F2:94:98:44',
]);

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function androidFingerprints(extra = '') {
  const list = [...ANDROID_CERT_SHA256];
  for (const item of String(extra || '').split(',')) {
    const value = item.trim().toUpperCase();
    if (FINGERPRINT.test(value)) list.push(value);
  }
  return [...new Set(list)];
}

export function appleAppSiteAssociation() {
  return { webcredentials: { apps: [...IOS_APP_IDS] } };
}

export function assetLinks(extra = '') {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
      target: { namespace: 'android_app', package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: androidFingerprints(extra) },
    },
  ];
}

/** `null` when the path is not a well-known association file. */
export function wellKnownResponse(pathname, env = process.env) {
  if (pathname === '/.well-known/apple-app-site-association' || pathname === '/apple-app-site-association') {
    return JSON.stringify(appleAppSiteAssociation());
  }
  if (pathname === '/.well-known/assetlinks.json') {
    return JSON.stringify(assetLinks(env.LVT_ANDROID_CERT_SHA256 || ''));
  }
  return null;
}
