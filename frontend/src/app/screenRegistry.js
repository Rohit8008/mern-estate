import {
  HiOutlineHome, HiOutlineChartBar, HiOutlineOfficeBuilding, HiOutlineTag,
  HiOutlinePlus, HiOutlineUpload, HiOutlineUsers, HiOutlineUserGroup,
  HiOutlineViewBoards, HiOutlineCollection, HiOutlineClipboardList,
  HiOutlineCalendar, HiOutlineCurrencyDollar, HiOutlineDocumentReport,
  HiOutlineShieldCheck, HiOutlineCog,
} from 'react-icons/hi';

/**
 * The client half of the screen catalogue.
 *
 * The server owns what each screen *is* — its id, label, section, the
 * permission it needs, and whether this workspace has it. This file owns how it
 * looks and where it lives in the router: an icon and a route are presentation,
 * and shipping them from the database would mean a config edit could break
 * navigation.
 *
 * `id` is the join between the two, and it is a contract with every workspace's
 * stored settings. Renaming one here silently detaches a screen from the
 * server's catalogue; the screen then disappears from the menu with no error.
 * Add and deprecate freely — never rename.
 *
 * `matches` lists extra path prefixes that should light this item up, so
 * editing a property keeps "All Properties" highlighted rather than leaving the
 * sidebar looking like you have navigated nowhere.
 */
export const SCREEN_REGISTRY = {
  dashboard:     { icon: HiOutlineHome,             route: '/dashboard' },
  analytics:     { icon: HiOutlineChartBar,         route: '/analytics' },

  properties:    { icon: HiOutlineOfficeBuilding,   route: '/properties',
                   matches: ['/update-listing', '/portfolio'] },
  categories:    { icon: HiOutlineTag,              route: '/categories',
                   matches: ['/category/', '/dynamic-listings/'] },
  createListing: { icon: HiOutlinePlus,             route: '/create-listing' },
  import:        { icon: HiOutlineUpload,           route: '/admin/import' },

  clients:       { icon: HiOutlineUsers,            route: '/clients' },
  owners:        { icon: HiOutlineUserGroup,        route: '/owners' },
  pipeline:      { icon: HiOutlineViewBoards,       route: '/pipeline' },
  buyers:        { icon: HiOutlineCollection,       route: '/buyers',
                   matches: ['/buyer-requirements'] },
  tasks:         { icon: HiOutlineClipboardList,    route: '/tasks' },
  calendar:      { icon: HiOutlineCalendar,         route: '/calendar' },

  transactions:  { icon: HiOutlineCurrencyDollar,   route: '/transactions' },
  reports:       { icon: HiOutlineDocumentReport,   route: '/reports',
                   matches: ['/client-reports'] },

  adminPanel:    { icon: HiOutlineShieldCheck,      route: '/admin',
                   matches: ['/admin/categories', '/admin/property-types'] },
  settings:      { icon: HiOutlineCog,              route: '/settings' },
};

/**
 * Which screen owns a path — used to decide whether a route is reachable, and
 * to title the page. Longest route wins, so `/admin/import` resolves to the
 * import screen rather than to the admin panel.
 */
export function screenIdForPath(pathname) {
  let best = null;
  let bestLength = -1;

  Object.entries(SCREEN_REGISTRY).forEach(([id, def]) => {
    [def.route, ...(def.matches || [])].forEach((prefix) => {
      // Exact, or followed by a separator. A bare startsWith would make
      // /properties match /properties-archive, quietly gating an unrelated page
      // on a screen it has nothing to do with.
      const boundary = prefix.endsWith('/') ? prefix : `${prefix}/`;
      if (pathname !== prefix && !pathname.startsWith(boundary)) return;
      if (prefix.length > bestLength) {
        best = id;
        bestLength = prefix.length;
      }
    });
  });

  return best;
}
