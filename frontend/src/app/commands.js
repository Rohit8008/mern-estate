import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlinePlus, HiOutlineUserAdd, HiOutlineClipboardCheck, HiOutlineUpload,
  HiOutlineMoon, HiOutlineSun, HiOutlineUser, HiOutlineQuestionMarkCircle,
  HiOutlineUserGroup,
} from 'react-icons/hi';
import { useScreens } from '../hooks/useScreens';
import { usePermissions } from '../contexts/PermissionsContext';
import { useAppearance } from '../contexts/useAppearance';

/** Fired to open the keyboard-shortcuts sheet from anywhere (the palette, `?`). */
export const SHOW_SHORTCUTS_EVENT = 'crm:show-shortcuts';
/** Fired to collapse or expand the sidebar from a shortcut. */
export const TOGGLE_SIDEBAR_EVENT = 'crm:toggle-sidebar';

/**
 * Two-key "go to" shortcuts, keyed by screen id. Screen ids are the contract
 * with stored settings (see screenRegistry.js), so a renamed screen keeps its
 * shortcut and a workspace's own label shows next to it.
 */
export const GO_SHORTCUTS = {
  dashboard: 'g d',
  properties: 'g p',
  clients: 'g c',
  owners: 'g o',
  pipeline: 'g l',
  buyers: 'g b',
  tasks: 'g t',
  calendar: 'g k',
  transactions: 'g x',
  reports: 'g r',
  settings: 'g s',
};

/**
 * Everything the palette and the keyboard can do, already filtered to what
 * this user, in this workspace, may do. One list for both, so a shortcut can
 * never reach an action the palette would hide — and neither is a security
 * boundary: the API still decides.
 *
 * A command has either `to` (a route) or `run` (an action), plus an optional
 * `shortcut` shown as a hint and bound by KeyboardShortcuts.
 */
export function useCommands() {
  const { t } = useTranslation();
  const { screens, canSee } = useScreens();
  const { can } = usePermissions();
  const { resolvedTheme, setTheme } = useAppearance();

  return useMemo(() => {
    // "New …" opens the screen's own create form via `?new=1`, so the form,
    // its validation and its permission check stay where they already live.
    const create = [
      canSee('createListing') && can('createListing') && {
        id: 'new-property', label: t('commands.newProperty'), icon: HiOutlinePlus, to: '/create-listing', shortcut: 'n p',
        keywords: 'listing add create',
      },
      canSee('clients') && can('createClient') && {
        id: 'new-lead', label: t('commands.newLead'), icon: HiOutlineUserAdd, to: '/clients?new=1', shortcut: 'n l',
        keywords: 'client contact add create',
      },
      canSee('tasks') && {
        id: 'new-task', label: t('commands.newTask'), icon: HiOutlineClipboardCheck, to: '/tasks?new=1', shortcut: 'n t',
        keywords: 'todo reminder follow up add create',
      },
      canSee('owners') && can('createOwner') && {
        id: 'new-owner', label: t('commands.newOwner'), icon: HiOutlineUserGroup, to: '/owners?new=1', shortcut: 'n o',
        keywords: 'landlord seller add create',
      },
      canSee('clients') && can('createClient') && {
        id: 'import-leads', label: t('commands.importLeads'), icon: HiOutlineUpload, to: '/admin/import-leads',
        keywords: 'csv excel upload',
      },
      canSee('import') && {
        id: 'import-properties', label: t('commands.importProperties'), icon: HiOutlineUpload, to: '/admin/import',
        keywords: 'csv excel upload listings',
      },
    ].filter(Boolean);

    const navigate = screens
      .filter((s) => s.id !== 'createListing' && s.id !== 'import')
      .map((s) => ({
        id: `go-${s.id}`,
        label: s.label,
        icon: s.icon,
        to: s.route,
        shortcut: GO_SHORTCUTS[s.id],
        keywords: `go open ${s.id}`,
      }));

    const general = [
      {
        id: 'toggle-theme',
        label: resolvedTheme === 'dark' ? t('commands.lightMode') : t('commands.darkMode'),
        icon: resolvedTheme === 'dark' ? HiOutlineSun : HiOutlineMoon,
        run: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
        keywords: 'theme appearance dark light',
      },
      { id: 'profile', label: t('crmShell.viewProfile'), icon: HiOutlineUser, to: '/profile', keywords: 'account me' },
      {
        id: 'shortcuts',
        label: t('commands.keyboardShortcuts'),
        icon: HiOutlineQuestionMarkCircle,
        run: () => window.dispatchEvent(new Event(SHOW_SHORTCUTS_EVENT)),
        shortcut: '?',
        keywords: 'help keys hotkeys',
      },
    ];

    return { create, navigate, general };
  }, [screens, canSee, can, t, resolvedTheme, setTheme]);
}

/** Case-insensitive match on the label and keywords, every word must appear. */
export function matchesCommand(command, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${command.label} ${command.keywords || ''}`.toLowerCase();
  return words.every((w) => haystack.includes(w));
}
