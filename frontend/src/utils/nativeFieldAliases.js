// Some category-defined fields are just aliases for real Listing schema columns
// (added for plot-ledger imports where the schema already has dedicated typed
// fields for this data, e.g. plot number/size/sq-yard) — read/write those directly
// instead of duplicating the value into `attributes`.
export const NATIVE_FIELD_ALIASES = {
  // Null prototype — this is looked up by user-supplied category field keys,
  // and a normal object would resolve `__proto__` or `constructor` to inherited
  // values rather than to nothing. Keep in step with the backend copy in
  // backend/utils/importMapping.js.
  __proto__: null,
  sqYard: 'sqYard',
  rateSqYard: 'sqYardRate',
  totalValue: 'totalValue',
  propertyNo: 'propertyNo',
  plotSize: 'plotSize',
  remarks: 'remarks',
  areaName: 'areaName',
};
