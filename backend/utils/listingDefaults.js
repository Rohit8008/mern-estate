// A listing's own location wins when both lat/lng are set; otherwise fall back to the
// category's defaultLocation. Computed at read time (never persisted) so editing a
// category's default instantly applies to every listing that hasn't set its own.
export function resolveEffectiveLocation(location, categoryDefaultLocation) {
  if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
    return location;
  }
  if (categoryDefaultLocation && typeof categoryDefaultLocation.lat === 'number' && typeof categoryDefaultLocation.lng === 'number') {
    return categoryDefaultLocation;
  }
  return null;
}

// Mutates `listings` (lean plain objects) in place, adding `effectiveLocation` to each,
// batching the category lookup to avoid an N+1 query per listing.
export async function attachEffectiveLocations(listings, CategoryModel) {
  const categorySlugs = [...new Set(listings.map((l) => l.category).filter(Boolean))];
  const defaultLocationBySlug = new Map();
  if (categorySlugs.length > 0) {
    const categories = await CategoryModel.find({ slug: { $in: categorySlugs } }).select('slug defaultLocation').lean();
    categories.forEach((c) => defaultLocationBySlug.set(c.slug, c.defaultLocation));
  }
  listings.forEach((l) => {
    l.effectiveLocation = resolveEffectiveLocation(l.location, defaultLocationBySlug.get(l.category));
  });
  return listings;
}
