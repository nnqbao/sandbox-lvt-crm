/** Public introduction page for other schools (no sign-in, fictional screenshots only). */
export const INTRODUCTION_PATHS = Object.freeze(['/introduction', '/gioi-thieu']);

export function isPublicIntroductionPath(pathname) {
  const raw = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
  const path = raw === '/' ? '/' : `/${raw.replace(/^\/+|\/+$/g, '')}`;
  return INTRODUCTION_PATHS.includes(path.toLowerCase());
}
