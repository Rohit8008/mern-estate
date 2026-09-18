import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../utils/http';
import { setLocaleConfig } from '../utils/currency';
import { applyWorkspaceLanguage } from '../i18n/index.js';

/**
 * The workspace this browser is talking to.
 *
 * One fetch of `/api/tenant/config` per session gives the whole app the
 * agency's identity: their product name, their palette, their locale and the
 * features they've been given. It is deliberately readable before sign-in, so
 * the login screen is already branded.
 *
 * Two things this deliberately does NOT do:
 *   • it does not gate rendering on the request — the app paints with sensible
 *     defaults and re-paints when config lands, so a slow config call never
 *     shows a blank screen
 *   • it does not treat features as permissions. A feature flag decides whether
 *     a workspace *bought* a module; the API still decides whether this user may
 *     use it. Hiding a menu item is presentation, not security.
 */

const TenantContext = createContext(null);

/** What the app looks like before config arrives, or if it fails. */
const FALLBACK = {
  name: 'Real Vista',
  slug: null,
  features: {},
  branding: {
    productName: 'Real Vista',
    logoUrl: '',
    tokens: {
      brand: '#2b6faa',
      brandContrast: '#ffffff',
      accent: '#0ea5e9',
      sidebar: '#0f172a',
      sidebarText: '#e2e8f0',
    },
  },
  locale: {
    currency: 'INR',
    numberLocale: 'en-IN',
    timezone: 'Asia/Kolkata',
    dateFormat: 'dd/MM/yyyy',
    language: 'en',
    areaUnit: 'sqyard',
  },
  workflow: {},
  // The screen catalogue arrives with the config. Empty until it does — the
  // shell shows no menu rather than a guessed one, so a workspace never
  // briefly sees a module it does not have.
  screens: [],
  sections: [],
};

/**
 * Write the palette onto :root as CSS custom properties.
 *
 * Tailwind classes stay as they are; components that should follow the agency's
 * colour read `var(--brand)`. That keeps one build serving every workspace —
 * changing a tenant's palette is a config edit, not a deploy.
 */
const TOKEN_CSS_VARS = {
  brand: '--brand',
  brandContrast: '--brand-contrast',
  // Not `--accent`: that name is already taken by the shadcn token set in
  // tailwind.config.js, and overwriting it would repaint unrelated components.
  accent: '--accent-color',
  sidebar: '--sidebar',
  sidebarText: '--sidebar-text',
};

function applyBrandTokens(tokens) {
  if (!tokens) return;
  const root = document.documentElement;
  Object.entries(TOKEN_CSS_VARS).forEach(([key, cssVar]) => {
    const value = tokens[key];
    if (typeof value !== 'string' || !value) return;
    root.style.setProperty(cssVar, value);
  });
}

/**
 * Module-level cache with in-flight de-duplication.
 *
 * Several independent parts of the app want workspace config during start-up
 * (the shell, the login screen, the currency formatter). Without this, each
 * would fire its own request for the same session-static document — the exact
 * problem kpi-dashboard hit, where one login triggered ~18 identical GETs.
 */
let cached = null;
let inFlight = null;

export function invalidateTenantConfig() {
  cached = null;
  inFlight = null;
}

async function fetchTenantConfig() {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = apiClient
    .get('/tenant/config', { silent: true })
    .then((res) => {
      cached = res?.data || null;
      inFlight = null;
      return cached;
    })
    .catch((err) => {
      inFlight = null;
      throw err;
    });

  return inFlight;
}

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(cached || FALLBACK);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchTenantConfig()
      .then((config) => {
        if (!alive || !config) return;
        setTenant({ ...FALLBACK, ...config });
        applyBrandTokens(config.branding?.tokens);
        // Currency, number grouping, area unit and date format all follow the
        // workspace. Without this the settings round-trip to the database and
        // nothing on screen changes.
        setLocaleConfig(config.locale);
        // The workspace default; a person's own choice, if they made one, wins.
        applyWorkspaceLanguage(config.locale?.language);
      })
      .catch((err) => {
        // A workspace that can't be reached still gets a usable app on the
        // defaults; the error is surfaced for anything that wants to react.
        if (alive) setError(err);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const productName = tenant?.branding?.productName || tenant?.name;
    if (productName) document.title = productName;
  }, [tenant]);

  const value = useMemo(
    () => ({
      tenant,
      loading,
      error,
      /** Has this workspace been given the named module? */
      // `features` stores ONLY explicit false (the controller deletes the key
      // when a screen is re-enabled), so an absent key means ON. Boolean()
      // reported every default-on module as off. Same rule as useFeature.
      hasFeature: (id) => tenant?.features?.[id] !== false,
      /** Re-read config after a workspace admin changes settings. */
      refresh: async () => {
        invalidateTenantConfig();
        const config = await fetchTenantConfig();
        if (config) {
          setTenant({ ...FALLBACK, ...config });
          applyBrandTokens(config.branding?.tokens);
          setLocaleConfig(config.locale);
          applyWorkspaceLanguage(config.locale?.language);
        }
        return config;
      },
    }),
    [tenant, loading, error]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used inside <TenantProvider>');
  return ctx;
}

/**
 * Whether this workspace has a module.
 *
 * A feature that has never been configured is ON: a workspace should not lose
 * an existing screen the day flags are introduced. Turning something off is an
 * explicit `false`, so the flags table stays small and says only what differs
 * from the product default.
 */
export function useFeature(id) {
  const { tenant } = useTenant();
  const value = tenant?.features?.[id];
  return value === undefined ? true : Boolean(value);
}

/** Locale settings, for currency and area formatting. */
export function useTenantLocale() {
  const { tenant } = useTenant();
  return tenant?.locale || FALLBACK.locale;
}
