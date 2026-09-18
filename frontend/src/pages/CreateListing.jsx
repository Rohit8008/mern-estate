import ListingForm from './ListingForm';

/**
 * Adding a property.
 *
 * The form itself lives in ListingForm — this file used to hold 1,775 lines
 * that were a near-copy of UpdateListing's 1,158. Keeping the route's own entry
 * point means AppRoutes and its lazy import are unchanged.
 */
export default function CreateListing() {
  return <ListingForm mode="create" />;
}
