/**
 * The kinds of client report, for both a template and a report generated
 * from it.
 *
 * Two copies of this list had drifted apart: templates allowed
 * transaction_history, client_portfolio and monthly_summary — the Reports
 * screen offers all three — but a generated report did not, so generating
 * from any of those templates failed on save. One list now, read by
 * reportTemplate.model.js and generatedReport.model.js alike (CLAUDE.md,
 * "Catalogues are single sources").
 */
export const REPORT_TYPES = Object.freeze([
  'property_summary',
  'market_analysis',
  'investment_report',
  'transaction_history',
  'client_portfolio',
  'monthly_summary',
  'rental_report',
  'comparative_analysis',
  'custom',
]);
