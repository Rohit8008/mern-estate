import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useTenant } from '../contexts/TenantProvider';
import { usePermissions } from '../contexts/PermissionsContext';
import { SCREEN_REGISTRY, screenIdForPath } from '../app/screenRegistry';

/**
 * What this user, in this workspace, can actually see.
 *
 * A screen appears only if all three agree:
 *   1. the product has it        — it's in the client registry AND the server catalogue
 *   2. the workspace bought it   — the tenant's feature flags
 *   3. the user may use it       — their permissions, and admin-only screens
 *
 * Those are three different questions and the answers change independently: a
 * flag is commercial, a permission is about this person, and the registry is
 * about what has been built. Collapsing them into one check is how menus end up
 * showing things that 403 when clicked.
 *
 * None of this is a security boundary. Hiding a menu item is presentation; the
 * API decides what a request may do. This just stops the UI offering what it
 * cannot deliver.
 */
export function useScreens() {
  const { t } = useTranslation();
  const { tenant, loading } = useTenant();
  const { can, ready: permissionsReady } = usePermissions();
  const { currentUser } = useSelector((s) => s.user);
  const isAdmin = currentUser?.role === 'admin';

  /**
   * A workspace rename wins over a translation.
   *
   * An agency that renamed "Clients" to "Leads" means it — translating their
   * word would undo a deliberate choice. Only the product's own default label
   * is translated, and `defaultLabel` (sent by the server alongside `label`) is
   * what tells the two apart.
   */
  const localiseLabel = useMemo(() => (screen) => {
    const isWorkspaceRename = screen.defaultLabel && screen.label !== screen.defaultLabel;
    if (isWorkspaceRename) return screen.label;

    const key = `nav.screens.${screen.id}`;
    const translated = t(key);
    // i18next returns the key itself when there is no entry for it.
    return translated === key ? screen.label : translated;
  }, [t]);

  const screens = useMemo(() => {
    const catalogue = tenant?.screens || [];

    return catalogue
      .filter((screen) => {
        // A screen the server knows about but this build has no route for —
        // an older client against a newer API. Skipping it beats rendering a
        // menu item that navigates nowhere, but it is also how a renamed id
        // silently loses a screen, so say so while developing.
        if (!SCREEN_REGISTRY[screen.id]) {
          if (import.meta.env.DEV) {
            console.warn(
              `[screens] "${screen.id}" is in the server catalogue but has no entry in ` +
                'screenRegistry.js — it will not appear in the menu. Add an icon and route, ' +
                'or check whether an id was renamed.'
            );
          }
          return false;
        }
        if (!screen.enabled) return false;
        if (screen.adminOnly && !isAdmin) return false;
        return can(screen.requires);
      })
      .map((screen) => ({
        ...screen,
        ...SCREEN_REGISTRY[screen.id],
        label: localiseLabel(screen),
      }))
      .sort((a, b) => a.order - b.order);
    // localiseLabel closes over `t`, whose identity changes when the language
    // does — so the menu re-labels itself without needing i18n.language here.
  }, [tenant, can, isAdmin, localiseLabel]);


  const sections = useMemo(() => {
    const bySection = new Map();
    screens.forEach((screen) => {
      if (!bySection.has(screen.section)) bySection.set(screen.section, []);
      bySection.get(screen.section).push(screen);
    });

    return (tenant?.sections || [])
      .map((section) => {
        const key = `nav.sections.${section.id}`;
        const translated = t(key);
        return {
          ...section,
          label: translated === key ? section.label : translated,
          items: bySection.get(section.id) || [],
        };
      })
      .filter((section) => section.items.length > 0);
  }, [screens, tenant, t]);

  const visibleIds = useMemo(() => new Set(screens.map((s) => s.id)), [screens]);

  return {
    screens,
    sections,
    /** Whether the current user can reach a screen by id. */
    canSee: (id) => visibleIds.has(id),
    /** Whether a path belongs to a screen this user can reach. */
    canSeePath: (pathname) => {
      const id = screenIdForPath(pathname);
      // A path with no owning screen — a detail page, a profile — is not
      // gated here; its own route guard still applies.
      return id === null || visibleIds.has(id);
    },
    /** True once both the workspace config and permissions have arrived. */
    ready: !loading && permissionsReady,
  };
}

/**
 * The label this workspace uses for a screen — which may be their own rename.
 * Falls back to the route's own title when the id isn't a catalogue screen.
 */
export function useScreenLabel(pathname, fallback = 'Real Vista') {
  const { tenant } = useTenant();
  const id = screenIdForPath(pathname);
  if (!id) return fallback;
  const screen = (tenant?.screens || []).find((s) => s.id === id);
  return screen?.label || fallback;
}
