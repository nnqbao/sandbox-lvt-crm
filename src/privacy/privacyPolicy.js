export const PRIVACY_POLICY_PATHS = Object.freeze(['/privacy', '/chinh-sach-bao-mat']);
export const PRIVACY_POLICY_CANONICAL_PATH = '/privacy';
export const PRIVACY_CONTACT_EMAIL = 'nnqbao@gmail.com';
export const PRIVACY_ORGANIZATION_VI = 'THCS Lê Văn Tám';
export const PRIVACY_ORGANIZATION_EN = 'Le Van Tam Secondary School (THCS Lê Văn Tám)';
export const PRIVACY_APP_NAME = 'CRM Lê Văn Tám';
export const PRIVACY_EFFECTIVE_DATE_VI = '24 tháng 10 năm 2026';
export const PRIVACY_EFFECTIVE_DATE_EN = '24 October 2026';
export const PRIVACY_SITE_ORIGIN = 'https://lvt.vscgroup.io.vn';
export const ACCOUNT_DELETION_PATHS = Object.freeze(['/xoa-tai-khoan', '/account-deletion']);
export const ACCOUNT_DELETION_CANONICAL_PATH = '/xoa-tai-khoan';

function normalizePublicPath(pathname) {
  const raw = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  if (raw === '/') return '/';
  return `/${raw.replace(/^\/+|\/+$/g, '')}`;
}

export function isPublicPrivacyPath(pathname) {
  return PRIVACY_POLICY_PATHS.includes(normalizePublicPath(pathname));
}

export function isPublicAccountDeletionPath(pathname) {
  return ACCOUNT_DELETION_PATHS.includes(normalizePublicPath(pathname));
}

export function isPublicLegalPath(pathname) {
  return isPublicPrivacyPath(pathname) || isPublicAccountDeletionPath(pathname);
}
