const INTERNAL_PATHS = [
  /^\/$/,
  /^\/quiz$/,
  /^\/foci\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  /^\/subjects\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  /^\/quiz\/sessions\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
];

const FALLBACK = '/';
const BASE_URL = 'https://bokken.invalid';

/** Accept only known app routes from router state; everything else returns to the dashboard. */
export function getSafeRedirect(from: unknown): string {
  if (!from || typeof from !== 'object') return FALLBACK;

  const candidate = from as { pathname?: unknown; search?: unknown; hash?: unknown };
  const { pathname, search = '', hash = '' } = candidate;
  if (typeof pathname !== 'string' || typeof search !== 'string' || typeof hash !== 'string') return FALLBACK;
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('\\') || /%(?:2f|5c)/i.test(pathname)) return FALLBACK;
  if (/[\u0000-\u001f\u007f]/.test(`${pathname}${search}${hash}`)) return FALLBACK;

  let decodedPath = pathname;
  try {
    for (let i = 0; i < 4; i += 1) {
      const decoded = decodeURIComponent(decodedPath);
      if (decoded === decodedPath) break;
      decodedPath = decoded;
    }
  } catch {
    return FALLBACK;
  }
  if (decodedPath.includes('\\') || !INTERNAL_PATHS.some(pattern => pattern.test(decodedPath))) return FALLBACK;

  try {
    const url = new URL(`${pathname}${search}${hash}`, BASE_URL);
    if (url.origin !== BASE_URL || url.username || url.password || url.pathname !== pathname) return FALLBACK;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return FALLBACK;
  }
}
