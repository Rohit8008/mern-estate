import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../utils/http';
import { NATIVE_FIELD_ALIASES } from '../utils/nativeFieldAliases';
import { isCategoryFieldActive } from '../utils/categoryFieldRules';
import { getLocaleConfig } from '../utils/currency';
import { useNotification } from '../contexts/NotificationContext';

/**
 * The state behind adding and editing a property.
 *
 * There used to be two of these — 1,775 lines in CreateListing and 1,158 in
 * UpdateListing — holding the same form written twice. They had already
 * drifted: the create form had camera capture, the edit form had documents and
 * voice notes, and each had a slightly different idea of what a payload looked
 * like. Every new property field meant two edits, and forgetting one gave you a
 * field that saved on create and vanished on edit.
 *
 * Create and edit differ in exactly three ways — where the initial values come
 * from, which endpoint saves, and which extras are available once a record
 * exists — so `mode` handles those and everything else is shared.
 */

const EMPTY = {
  name: '',
  description: '',
  address: '',
  city: '',
  locality: '',
  state: '',
  pincode: '',
  type: 'sale',
  status: 'available',
  propertyType: '',
  bedrooms: 0,
  bathrooms: 0,
  regularPrice: 0,
  discountPrice: 0,
  offer: false,
  parking: false,
  furnished: false,
  category: '',
  ownerIds: [],
  imageUrls: [],
  attributes: {},
  location: { lat: null, lng: null },
  // Native columns that some categories surface as their own fields.
  areaName: '',
  propertyNo: '',
  plotSize: '',
  sqYard: 0,
  sqYardRate: 0,
  totalValue: 0,
  areaSqFt: 0,
  remarks: '',
};

/** The fields this form owns and saves; also what "unsaved changes" compares. */
const payloadOf = (form) => Object.fromEntries(Object.keys(EMPTY).map((key) => [key, form[key]]));

/**
 * Seeded categories reuse keys that are real listing columns (bedrooms,
 * bathrooms, parking, furnishing). The form hides its own input for those and
 * shows the category's, so the value is copied into the column as well —
 * filters, cards and the bed/bath line all read the column.
 */
const NATIVE_MIRRORS = {
  bedrooms: (v) => ({ bedrooms: Number(v) || 0 }),
  bathrooms: (v) => ({ bathrooms: Number(v) || 0 }),
  parking: (v) => ({ parking: Boolean(v) && !/^(no|none|0|not available)/i.test(String(v)) }),
  furnishing: (v) => ({ furnished: Boolean(v) && !/^un/i.test(String(v)) }),
};

/**
 * Square feet in one of a category's own "Area Unit" options. Bigha, Biswa and
 * Marla vary by state, so they are left out rather than guessed — an area in
 * one of those is not copied into the built-in size column.
 */
const PLOT_UNIT_SQFT = {
  'Sq Ft': 1,
  'Sq Yards': 9,
  'Sq Meters': 10.7639,
  Acres: 43560,
  Hectares: 107639,
  Guntha: 1089,
  Kanal: 5445,
};

/** Category fields the form already asks for elsewhere (the top-level Type). */
const COVERED_BY_FORM = new Set(['transactionType']);

/** True when the category's plot area can stand in for the built-in Area input. */
export const plotAreaDrivesSize = (attributes) =>
  !attributes?.plotAreaUnit || attributes.plotAreaUnit in PLOT_UNIT_SQFT;

export function useListingForm({ mode, listingId }) {
  const navigate = useNavigate();
  const isEdit = mode === 'edit';

  const [form, setForm] = useState(EMPTY);
  const [categories, setCategories] = useState([]);
  const [owners, setOwners] = useState([]);
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const { showSuccess } = useNotification();
  // What was loaded (or EMPTY for a new property), to tell edits from nothing.
  const baselineRef = useRef(JSON.stringify(payloadOf(EMPTY)));
  const savedRef = useRef(false);
  // The version this form was loaded at. Sent with the save so the server can
  // refuse it if a colleague saved the same property in the meantime.
  const loadedUpdatedAtRef = useRef(null);
  // Set when the server says someone else saved first: { currentUpdatedAt }.
  const [conflict, setConflict] = useState(null);
  // Bumped to load the property again — "reload their version".
  const [reloadKey, setReloadKey] = useState(0);

  const patch = useCallback((changes, { overwrite = false } = {}) => {
    setForm((prev) => {
      const next = { ...prev };
      Object.entries(changes).forEach(([key, value]) => {
        // Never blank a field. And unless the user picked a suggestion, only
        // fill empty ones: "Find on map" used to replace a typed Bathinda
        // address with the geocoder's Hyderabad match. The pin itself is the
        // point of a lookup, so `location` is always taken.
        if (value === undefined || value === null || value === '') return;
        const current = prev[key];
        const isEmpty = current === undefined || current === null || current === '';
        if (key === 'location' || overwrite || isEmpty) next[key] = value;
      });
      return next;
    });
  }, []);

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  }, []);

  /**
   * A category-defined field. When the key aliases a real schema column the
   * value goes there, not into `attributes` — that column is what filters,
   * sorting and duplicate detection read, so a value hidden in the dynamic map
   * would be invisible to all three.
   */
  const setCategoryField = useCallback((key, value) => {
    const nativeKey = NATIVE_FIELD_ALIASES[key];
    setForm((prev) => {
      if (nativeKey) return { ...prev, [nativeKey]: value };
      const attributes = { ...prev.attributes, [key]: value };
      let next = { ...prev, ...(NATIVE_MIRRORS[key] ? NATIVE_MIRRORS[key](value) : {}), attributes };
      // A land category's Plot Area is the property's size. Copy it into the
      // built-in size columns so the form need not ask for the area twice and
      // total value (area × rate), sorting and filtering still work.
      if (key === 'plotArea' || key === 'plotAreaUnit') {
        const perUnit = PLOT_UNIT_SQFT[attributes.plotAreaUnit || 'Sq Ft'];
        const area = Number(attributes.plotArea);
        if (perUnit && Number.isFinite(area)) {
          const sqft = Math.round(area * perUnit);
          next = { ...next, areaSqFt: sqft };
          if (getLocaleConfig().areaUnit === 'sqyard') next.sqYard = Math.round((sqft / 9) * 100) / 100;
        }
      }
      return next;
    });
  }, []);


  /** The value to show for a category field, wherever it happens to live. */
  const categoryFieldValue = useCallback(
    (key) => {
      const nativeKey = NATIVE_FIELD_ALIASES[key];
      return nativeKey ? form[nativeKey] : form.attributes?.[key];
    },
    [form]
  );

  // ── Reference data ─────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    Promise.all([
      apiClient.get('/category/list', { silent: true }).catch(() => []),
      apiClient.get('/owner/list', { silent: true }).catch(() => []),
      apiClient.get('/property-types/list', { silent: true }).catch(() => []),
    ]).then(([cats, owns, types]) => {
      if (!alive) return;
      const unwrap = (r) => (Array.isArray(r) ? r : r?.data || []);
      setCategories(unwrap(cats));
      setOwners(unwrap(owns));
      setPropertyTypes(unwrap(types));
    });
    return () => {
      alive = false;
    };
  }, []);

  // ── Existing listing, when editing ─────────────────────────────────────────
  useEffect(() => {
    if (!isEdit || !listingId) return undefined;
    let alive = true;
    setLoading(true);
    apiClient
      .get(`/listing/get/${listingId}`)
      .then((data) => {
        if (!alive) return;
        const listing = data?.data || data;
        const loaded = {
          ...EMPTY,
          ...listing,
          // Mongoose Maps arrive as plain objects; a null location must still
          // be a shape the map picker can read.
          attributes: listing.attributes || {},
          location: listing.location || { lat: null, lng: null },
          ownerIds: (listing.owners || listing.ownerIds || []).map((o) =>
            typeof o === 'string' ? o : String(o._id)
          ),
          imageUrls: listing.imageUrls || [],
        };
        baselineRef.current = JSON.stringify(payloadOf(loaded));
        loadedUpdatedAtRef.current = listing.updatedAt || null;
        setForm(loaded);
      })
      .catch((err) => {
        if (alive) setLoadError(err?.message || 'That property could not be loaded.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [isEdit, listingId, reloadKey]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.slug === form.category) || null,
    [categories, form.category]
  );

  // The category's fields minus those the form already asks for itself.
  const categoryFields = useMemo(
    () => (selectedCategory?.fields || []).filter((f) => !COVERED_BY_FORM.has(f.key)),
    [selectedCategory]
  );

  // The server infers `propertyCategory` (residential / commercial / land) from
  // this, so it is not merely descriptive — it drives how the property is
  // classified in filters and reporting.
  const selectedPropertyType = useMemo(
    () => propertyTypes.find((t) => t.slug === form.propertyType) || null,
    [propertyTypes, form.propertyType]
  );

  /** Client-side checks, matching what the API enforces. */
  const validate = useCallback(() => {
    if (!form.name?.trim()) return 'Give the property a name.';
    if (form.discountPrice && form.regularPrice && Number(form.discountPrice) >= Number(form.regularPrice)) {
      return 'The offer price has to be below the regular price.';
    }
    const valueOf = (key) => (NATIVE_FIELD_ALIASES[key] ? form[NATIVE_FIELD_ALIASES[key]] : form.attributes?.[key]);
    const missing = categoryFields
      .filter((f) => f.required && isCategoryFieldActive(f, valueOf))
      .filter((f) => {
        const v = valueOf(f.key);
        return v === undefined || v === null || v === '';
      })
      .map((f) => f.label);
    if (missing.length) return `${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required for this category.`;
    return '';
  }, [form, categoryFields]);

  const submit = useCallback(
    // `overwrite`: the person saw the conflict and chose to replace the other
    // edit, so the save goes without the version guard.
    async (e, { overwrite = false } = {}) => {
      e?.preventDefault?.();
      const problem = validate();
      if (problem) {
        setError(problem);
        return null;
      }

      setSaving(true);
      setError('');
      try {
        // Send only the fields this form owns. A read returns far more than that
        // — tenantId, isDeleted, createdAt, voiceNotes, the populated `owners` —
        // and echoing all of it back relies on the server's whitelist to discard
        // the rest. That works, but it makes the request say things the form did
        // not mean, and any future field added to a read would silently start
        // being written back.
        const payload = payloadOf(form);
        if (isEdit && !overwrite && loadedUpdatedAtRef.current) {
          payload.expectedUpdatedAt = loadedUpdatedAtRef.current;
        }

        // Silent: the form shows its own error, and a conflict its own dialog,
        // so the global toast would only say the same thing twice.
        const data = isEdit
          ? await apiClient.post(`/listing/update/${listingId}`, payload, { silent: true })
          : await apiClient.post('/listing/create', payload, { silent: true });
        setConflict(null);

        const saved = data?.data || data;
        window.dispatchEvent(
          new CustomEvent(isEdit ? 'listing-updated' : 'listing-created', {
            detail: { id: saved?._id },
          })
        );
        savedRef.current = true;
        showSuccess(isEdit ? 'Changes saved.' : 'Property added.');
        navigate(`/listing/${saved?._id || listingId}`);
        return saved;
      } catch (err) {
        if (err?.code === 'VERSION_CONFLICT') {
          setConflict({ currentUpdatedAt: err.details?.currentUpdatedAt || null });
          return null;
        }
        // A plan limit answers 402 and its message already says what to do, so
        // it is shown as-is rather than flattened into "could not save".
        setError(err?.message || 'That property could not be saved.');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [form, isEdit, listingId, navigate, validate, showSuccess]
  );

  /** Throw away this form's edits and load what the other person saved. */
  const reloadLatest = useCallback(() => {
    setConflict(null);
    setError('');
    setReloadKey((k) => k + 1);
  }, []);

  /** Keep this form's edits and replace the other person's. */
  const overwrite = useCallback(() => submit(null, { overwrite: true }), [submit]);

  const isDirty = !loading && !savedRef.current && JSON.stringify(payloadOf(form)) !== baselineRef.current;

  return {
    form,
    isDirty,
    setField,
    patch,
    setForm,
    setCategoryField,
    categoryFieldValue,
    categories,
    selectedCategory,
    owners,
    setOwners,
    categoryFields,
    propertyTypes,
    selectedPropertyType,
    loading,
    saving,
    error,
    setError,
    loadError,
    submit,
    isEdit,
    conflict,
    dismissConflict: () => setConflict(null),
    reloadLatest,
    overwrite,
  };
}

export { EMPTY as EMPTY_LISTING };
