import { Outlet } from 'react-router-dom';
import ActingAsBanner from '../components/ActingAsBanner';

/**
 * The acting banner for pages that are not inside CrmShell.
 *
 * `/search` and `/listing/:id` show a workspace's properties without the CRM
 * sidebar, so an operator who follows a property link out of the shell would
 * otherwise be looking at a customer's data with nothing on screen saying so —
 * which is precisely the confusion the banner exists to prevent.
 *
 * CrmShell renders its own copy rather than nesting inside this one: there the
 * banner has to sit beside a fixed sidebar and offset the sticky topbar, and
 * that positioning is specific to the shell.
 */
export default function ActingAwareLayout() {
  return (
    <>
      {/* MinimalHeader on these pages is `fixed top-0 h-14`, so the banner
          sticks below it rather than sliding underneath on scroll. */}
      <ActingAsBanner top='top-14' />
      <Outlet />
    </>
  );
}
