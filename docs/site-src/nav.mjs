/**
 * The docs table of contents. A page is a fragment in pages/<slug>.html; the
 * build wraps it in the layout. API pages are generated from openapi.json.
 */
export const NAV = [
  { section: 'Start', pages: [
    ['index', 'Overview'],
    ['getting-started', 'Getting started'],
  ] },
  { section: 'Product guide', pages: [
    ['leads-and-pipeline', 'Leads and pipeline'],
    ['listings-and-categories', 'Listings and categories'],
    ['sharing-and-imports', 'Sharing and imports'],
    ['team-roles-permissions', 'Team, roles and permissions'],
    ['workspace-settings', 'Workspace settings'],
  ] },
  { section: 'Architecture', pages: [
    ['architecture', 'System architecture'],
    ['multi-tenancy', 'Multi-tenancy and platform admin'],
    ['request-pipeline', 'Request pipeline and errors'],
    ['background-jobs', 'Background jobs and automation'],
    ['frontend', 'Frontend'],
  ] },
  { section: 'Security', pages: [
    ['authentication', 'Authentication and sessions'],
    ['security', 'Security and data protection'],
  ] },
  { section: 'API', pages: [
    ['api-overview', 'API conventions'],
    ['api/index', 'API reference'],
  ] },
  { section: 'Operations', pages: [
    ['operations', 'Deploy and operate'],
    ['mobile', 'Mobile app'],
    ['faq', 'FAQ and troubleshooting'],
  ] },
];
