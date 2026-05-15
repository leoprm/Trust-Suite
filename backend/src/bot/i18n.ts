import path from 'path';
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';

// ── Module-level singleton ──────────────────────────────────────────────
let initialized = false;

/**
 * Initialize i18next with filesystem backend.
 * Must be called once before any t() calls.
 * Idempotent — subsequent calls are no-ops.
 */
export async function initI18n(): Promise<void> {
  if (initialized) return;

  await i18next.use(Backend).init({
    fallbackLng: 'es',
    supportedLngs: ['es', 'en'],
    preload: ['es', 'en'],
    ns: ['common', 'onboarding', 'tree', 'needs', 'voting', 'errors', 'dm', 'kanban'],
    defaultNS: 'common',
    backend: {
      loadPath: path.join(__dirname, '..', '..', 'locales', '{{lng}}', '{{ns}}.json'),
    },
    interpolation: {
      escapeValue: false, // Telegram Markdown handles escaping
    },
  });

  initialized = true;
}

/**
 * Translate a key for a specific language with optional interpolation vars.
 * If i18next hasn't been initialized, returns the key as-is (safe fallback).
 *
 * Key format: "namespace.key" (e.g. "common.welcome") or bare key for defaultNS.
 *
 * @param key  Dot-separated namespace.key or bare key (uses defaultNS).
 * @param lng  Language code ('es' | 'en').
 * @param vars Optional interpolation variables (e.g. { name: 'Ari' }).
 */
const KNOWN_NS = new Set(['common', 'onboarding', 'tree', 'needs', 'voting', 'errors', 'dm', 'kanban']);

export function t(key: string, lng?: string, vars?: Record<string, unknown>): string {
  if (!initialized) return key;

  // Split "namespace:key" or "namespace.key" → resolve ns + real key
  const sep = key.includes(':') ? ':' : '.';
  const sepIdx = key.indexOf(sep);
  const [ns, realKey] =
    sepIdx > 0 && KNOWN_NS.has(key.slice(0, sepIdx))
      ? [key.slice(0, sepIdx), key.slice(sepIdx + 1)]
      : [undefined, key];

  return i18next.t(realKey, {
    ns,
    lng: lng ?? i18next.language,
    ...(vars ?? {}),
  });
}

/**
 * Returns the list of supported languages for UI display.
 */
export function getSupportedLanguages(): Array<{ code: string; name: string; flag: string }> {
  return [
    { code: 'es', name: 'Español',   flag: '\ud83c\uddf2\ud83c\uddfd' },  // 🇲🇽
    { code: 'en', name: 'English',    flag: '\ud83c\uddfa\ud83c\uddf8' },  // 🇺🇸
  ];
}
