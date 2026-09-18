import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../utils/http';
import { NATIVE_FIELD_ALIASES } from '../utils/nativeFieldAliases';

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
  bedrooms: 1,
  bathrooms: 1,
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

  const patch = useCallback((changes) => {
    setForm((prev) => {
      const next = { ...prev };
      Object.entries(changes).forEach(([key, value]) => {
        // A geocode result must not blank a field the user already filled in —
        // it fills gaps, it does not overwrite.
        if (value === undefined || value === null || value === '') return;
        next[key] = value;
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
    setForm((prev) =>
      nativeKey
        ? { ...prev, [nativeKey]: value }
        : { ...prev, attributes: { ...prev.attributes, [key]: value } }
    );
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
        setForm({
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
        });
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
  }, [isEdit, listingId]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.slug === form.category) || null,
    [categories, form.category]
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
    const missing = (selectedCategory?.fields || [])
      .filter((f) => f.required)
      .filter((f) => {
        const v = NATIVE_FIELD_ALIASES[f.key] ? form[NATIVE_FIELD_ALIASES[f.key]] : form.attributes?.[f.key];
        return v === undefined || v === null || v === '';
      })
      .map((f) => f.label);
    if (missing.length) return `${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required for this category.`;
    return '';
  }, [form, selectedCategory]);

  const submit = useCallback(
    async (e) => {
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
        const payload = Object.fromEntries(
          Object.keys(EMPTY).map((key) => [key, form[key]])
        );

        const data = isEdit
          ? await apiClient.post(`/listing/update/${listingId}`, payload)
          : await apiClient.post('/listing/create', payload);

        const saved = data?.data || data;
        window.dispatchEvent(
          new CustomEvent(isEdit ? 'listing-updated' : 'listing-created', {
            detail: { id: saved?._id },
          })
        );
        navigate(`/listing/${saved?._id || listingId}`);
        return saved;
      } catch (err) {
        // A plan limit answers 402 and its message already says what to do, so
        // it is shown as-is rather than flattened into "could not save".
        setError(err?.message || 'That property could not be saved.');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [form, isEdit, listingId, navigate, validate]
  );

  return {
    form,
    setField,
    patch,
    setForm,
    setCategoryField,
    categoryFieldValue,
    categories,
    selectedCategory,
    owners,
    setOwners,
    propertyTypes,
    selectedPropertyType,
    loading,
    saving,
    error,
    setError,
    loadError,
    submit,
    isEdit,
  };
}

export { EMPTY as EMPTY_LISTING };
