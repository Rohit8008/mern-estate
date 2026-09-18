import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

/**
 * Translation.
 *
 * Every string in the product was hardcoded English in JSX, and the workspace's
 * `locale.language` setting round-tripped to the database and was read by
 * nothing. This is the machinery that makes that setting mean something.
 *
 * Languages are discovered rather than listed: every `locales/*.json` file is
 * picked up at build time by Vite's glob import, so adding a language is
 * dropping in one file — no registry to remember to update, which is exactly
 * how the screen catalogue and the permission catalogue drifted.
 */

// Eager, not lazy: the bundles are small, and a language that arrives one tick
// after first paint shows a flash of English to someone who does not read it.
const modules = import.meta.glob('./locales/*.json', { eager: true });

/** Locale code -> resource bundle, keyed off the filename. */
export const resources = Object.entries(modules).reduce((acc, [path, module]) => {
  const code = path.match(/\/([\w-]+)\.json$/)?.[1];
  if (code) acc[code] = { translation: module.default || module };
  return acc;
}, {});

/**
 * What each language is called, in that language.
 *
 * Read from the bundle's own `_meta` so it travels with the file — a language
 * added by dropping in a JSON file names itself rather than needing an entry
 * somewhere else.
 */
export const availableLanguages = Object.entries(resources)
  .map(([code, bundle]) => ({
    code,
    name: bundle.translation?._meta?.name || code,
    englishName: bundle.translation?._meta?.englishName || code,
  }))
  .sort((a, b) => (a.code === 'en' ? -1 : b.code === 'en' ? 1 : a.englishName.localeCompare(b.englishName)));

i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: Object.keys(resources),

    // A missing key falls back to English rather than rendering the key itself:
    // a half-translated screen should read oddly, not look broken.
    fallbackNS: 'translation',
    returnEmptyString: false,

    interpolation: {
      // React escapes for us; doing it twice mangles apostrophes in names.
      escapeValue: false,
    },

    detection: {
      // The workspace's setting wins, then the person's own last choice, then
      // the browser. `app:language` is written by setLanguage below.
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'app:language',
      caches: ['localStorage'],
    },

    // Quiet in production; in development a missing key should be visible to
    // whoever is adding the screen.
    debug: false,
    saveMissing: false,
  });

/**
 * Switch language and remember it.
 *
 * Also sets `lang` on <html>, which is what tells a screen reader how to
 * pronounce the page and the browser how to hyphenate it.
 */
export function setLanguage(code) {
  if (!resources[code]) return false;
  i18next.changeLanguage(code);
  try {
    localStorage.setItem('app:language', code);
  } catch { /* private mode; the choice just will not persist */ }
  document.documentElement.setAttribute('lang', code);
  return true;
}

/** Apply the workspace default, unless this person has already chosen. */
export function applyWorkspaceLanguage(code) {
  if (!code || !resources[code]) return;
  let chosen = null;
  try {
    chosen = localStorage.getItem('app:language');
  } catch { /* ignore */ }
  if (!chosen) setLanguage(code);
}

document.documentElement.setAttribute('lang', i18next.language || 'en');

export default i18next;
