import { useEffect, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { apiClient, parseJsonSafely, fetchWithRefresh } from '../utils/http';
import { fieldProblem, fieldProblems, suggestKey } from '../utils/categoryFieldRules';
import { PageHeader, EmptyState } from '../design-system';
import { HiOutlineArrowLeft, HiOutlineAdjustments, HiOutlinePlus } from 'react-icons/hi';
import { usePermissions } from '../contexts/PermissionsContext';
import LocationPicker from '../components/LocationPicker';
import CategoryMedia from '../components/CategoryMedia';
import { useSelector } from 'react-redux';
import { formatNumber } from '../utils/currency';
import { useTranslation } from 'react-i18next';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean (Yes/No)' },
  { value: 'select', label: 'Select (Dropdown)' },
  { value: 'date', label: 'Date' },
  // The server (utils/categoryFields.js), the model enum and the renderer in
  // DynamicCategoryFields.jsx have all accepted 'textarea' all along — only
  // this dropdown omitted it, so the type was unreachable from the UI.
  { value: 'textarea', label: 'Long text' },
];

export default function AdminCategoryFields() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const { can, ready } = usePermissions();
  const [category, setCategory] = useState(null);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [defaultLocation, setDefaultLocation] = useState(null);
  const [savingLocation, setSavingLocation] = useState(false);
  // A save the server refused because it would hide recorded values.
  const [pendingDataLoss, setPendingDataLoss] = useState(null);
  const { currentUser } = useSelector((st) => st.user);
  const [locationMessage, setLocationMessage] = useState('');
  const [locationError, setLocationError] = useState('');

  useEffect(() => {
    const fetchCategory = async () => {
      if (!slug || !ready) return;
      if (!can('updateCategory')) return;
      try {
        setLoading(true);
        const res = await fetchWithRefresh(`/api/category/by-slug/${slug}`);
        const data = await parseJsonSafely(res);
        if (data) {
          setCategory(data);
          setFields(data.fields || []);
          setDefaultLocation(data.defaultLocation || null);
        } else {
          setError('Category not found');
        }
      } catch (e) {
        setError('Failed to load category');
      } finally {
        setLoading(false);
      }
    };
    fetchCategory();
  }, [slug, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const addField = () => {
    const newField = {
      key: '',
      label: '',
      type: 'text',
      required: false,
      options: [],
      description: '',
      placeholder: '',
      defaultValue: '',
      min: undefined,
      max: undefined,
      pattern: '',
      multiple: false,
      order: fields.length,
    };
    setFields([...fields, newField]);
  };

  const updateField = (index, key, value) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], [key]: value };
    
    // Suggest a key from the label while the key is still untouched. The old
    // version produced snake_case starting with whatever character the label
    // did, so a label like "3 Bedrooms" gave the invalid key `3_bedrooms`.
    if (key === 'label' && !newFields[index].key) {
      newFields[index].key = suggestKey(value);
    }
    
    setFields(newFields);
  };

  const removeField = (index) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const moveField = (index, direction) => {
    const newFields = [...fields];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex >= 0 && newIndex < newFields.length) {
      [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
      // Update order values
      newFields.forEach((field, i) => {
        field.order = i;
      });
      setFields(newFields);
    }
  };

  const addOption = (fieldIndex) => {
    const newFields = [...fields];
    newFields[fieldIndex].options = [...(newFields[fieldIndex].options || []), ''];
    setFields(newFields);
  };

  const updateOption = (fieldIndex, optionIndex, value) => {
    const newFields = [...fields];
    newFields[fieldIndex].options[optionIndex] = value;
    setFields(newFields);
  };

  const removeOption = (fieldIndex, optionIndex) => {
    const newFields = [...fields];
    newFields[fieldIndex].options = newFields[fieldIndex].options.filter((_, i) => i !== optionIndex);
    setFields(newFields);
  };

  const saveFields = async ({ force = false } = {}) => {
    try {
      setSaving(true);
      setError('');
      setMessage('');

      // Catch what can be caught here so the obvious mistakes are answered
      // without a round trip. The server checks the same things and more —
      // reserved keys, patterns that can hang the process — and is the
      // authority; this is only a faster first pass.
      const problems = fieldProblems(fields);
      if (problems.length) {
        setError(problems.map((p) => `Field ${p.index + 1}: ${p.message}`).join('\n'));
        return;
      }

      const saved = await apiClient.post(
        `/category/update-fields/${category._id}${force ? '?force=true' : ''}`,
        { fields }
      );

      setCategory({ ...category, fields: saved.fields || fields });
      setMessage('Fields saved.');
      setPendingDataLoss(null);
    } catch (e) {
      // 409 means removing a field would hide values already recorded against
      // it. That is a decision for the admin, not an error — the server sends
      // back exactly which fields and how many properties.
      if (e?.statusCode === 409 && e?.details?.removedWithData) {
        setPendingDataLoss({ message: e.message, removed: e.details.removedWithData });
      } else {
        setError(e?.message || 'Could not save those fields.');
      }
    } finally {
      setSaving(false);
    }
  };

  const saveLocation = async () => {
    try {
      setSavingLocation(true);
      setLocationError('');
      setLocationMessage('');

      const res = await fetchWithRefresh(`/api/category/update-location/${category._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultLocation }),
      });

      const data = await parseJsonSafely(res);
      if (res.ok && data) {
        setLocationMessage('Default location saved!');
        setCategory({ ...category, defaultLocation });
      } else {
        setLocationError(data?.message || 'Failed to save default location');
      }
    } catch (e) {
      setLocationError('Failed to save default location');
    } finally {
      setSavingLocation(false);
    }
  };

  if (ready && !can('updateCategory')) {
    return <Navigate to='/unauthorized' replace />;
  }

  if (!ready || loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !category) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 mb-4">{error}</p>
        <Link to="/categories" className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800">{t('adminCategoryFields.backToCategories')}</Link>
      </div>
    );
  }

  return (
    <main className="space-y-5">
      <PageHeader
        title={category?.name || 'Category'}
        description={t('adminCategoryFields.theExtraDetailsEveryPropertyIn')}
        actions={
          <Link
            to="/categories"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
          >
            <HiOutlineArrowLeft className="w-4 h-4" />{t('adminCategoryFields.allCategories')}</Link>
        }
      />

      {message && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm">
          {message}
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm whitespace-pre-line">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-slate-900">{t('adminCategoryFields.defaultLocation')}</h2>
          <p className="text-sm text-slate-600 mt-1">{t('adminCategoryFields.usedAsTheMapPinFor')}</p>
        </div>
        <div className="p-6">
          {locationMessage && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
              {locationMessage}
            </div>
          )}
          {locationError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {locationError}
            </div>
          )}
          <p className="text-xs text-slate-500 mb-2">{t('adminCategoryFields.clickOnTheMapToSet')}</p>
          <LocationPicker value={defaultLocation} onChange={(lat, lng) => setDefaultLocation({ lat, lng })} />
          {defaultLocation && (
            <button
              onClick={() => setDefaultLocation(null)}
              className="mt-2 text-xs text-slate-500 hover:text-red-600 underline"
            >{t('adminCategoryFields.clearLocation')}</button>
          )}
        </div>
        <div className="p-6 border-t bg-slate-50 flex justify-end">
          <button
            onClick={saveLocation}
            disabled={savingLocation}
            className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingLocation ? 'Saving...' : 'Save Default Location'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-1">Paperwork &amp; photos</h2>
          <p className="text-sm text-slate-500 mb-5 max-w-prose">
            The RERA certificate, the sanctioned layout, approvals and photographs of the
            colony. Anything you publish appears on the public colony page — everything else
            stays with your team.
          </p>
          <CategoryMedia
            categoryId={category?._id}
            canEdit
            isAdmin={currentUser?.role === 'admin'}
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-slate-900">{t('adminCategoryFields.dynamicFields')}</h2>
            <button
              onClick={addField}
              className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
            >{t('adminCategoryFields.addField')}</button>
          </div>
        </div>

        <div className="p-6">
          {fields.length === 0 ? (
            <EmptyState
              icon={HiOutlineAdjustments}
              title={t('adminCategoryFields.noExtraFieldsYet')}
              body={`Properties here record only the built-in details — name, address, price, area. Add fields for whatever else your team needs: plot size, facing, khasra number.`}
              action={
                <button
                  type="button"
                  onClick={addField}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                >
                  <HiOutlinePlus className="w-4 h-4" />{t('adminCategoryFields.addTheFirstField')}</button>
              }
            />
          ) : (
            <div className="space-y-6">
              {fields.map((field, index) => (
                <div key={index} className="border rounded-lg p-4 bg-slate-50">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold text-slate-900">Field {index + 1}</h3>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => moveField(index, 'up')}
                        disabled={index === 0}
                        className="px-2 py-1 text-xs bg-slate-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveField(index, 'down')}
                        disabled={index === fields.length - 1}
                        className="px-2 py-1 text-xs bg-slate-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => removeField(index)}
                        className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
                      >{t('adminCategoryFields.remove')}</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{t('adminCategoryFields.fieldKey')}</label>
                      <input
                        type="text"
                        value={field.key}
                        onChange={(e) => updateField(index, 'key', e.target.value)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500/20 ${
                          fieldProblem(field, index, fields)
                            ? 'border-rose-400 bg-rose-50'
                            : 'border-slate-300 focus:border-indigo-400'
                        }`}
                        placeholder={t('adminCategoryFields.eGPlotsize')}
                      />
                      {/* Answered as it is typed. The key is an identifier the
                          product carries for the life of this data, so catching
                          an awkward one now costs seconds and catching it later
                          costs a migration. */}
                      {fieldProblem(field, index, fields) && (
                        <p className="text-xs text-rose-600 mt-1">{fieldProblem(field, index, fields)}</p>
                      )}
                      {!fieldProblem(field, index, fields) && category?.fields?.some((f) => f.key === field.key) && (
                        <p className="text-xs text-slate-400 mt-1">{t('adminCategoryFields.savedFieldRenamingTheKeyStarts')}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{t('adminCategoryFields.fieldLabel')}</label>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => updateField(index, 'label', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                        placeholder={t('adminCategoryFields.eGPlotSize')}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{t('adminCategoryFields.fieldType')}</label>
                      <select
                        value={field.type}
                        onChange={(e) => updateField(index, 'type', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                      >
                        {FIELD_TYPES.map(type => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{t('adminCategoryFields.placeholder')}</label>
                      <input
                        type="text"
                        value={field.placeholder}
                        onChange={(e) => updateField(index, 'placeholder', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                        placeholder={t('adminCategoryFields.eGEnterPlotSizeIn')}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{t('adminCategoryFields.description')}</label>
                      <input
                        type="text"
                        value={field.description}
                        onChange={(e) => updateField(index, 'description', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                        placeholder={t('adminCategoryFields.optionalDescription')}
                      />
                    </div>

                    <div className="flex items-center">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => updateField(index, 'required', e.target.checked)}
                          className="mr-2"
                        />
                        <span className="text-sm font-medium text-slate-700">{t('adminCategoryFields.required')}</span>
                      </label>
                    </div>
                  </div>

                  {/* Number field specific options */}
                  {field.type === 'number' && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t('adminCategoryFields.minValue')}</label>
                        <input
                          type="number"
                          value={field.min || ''}
                          onChange={(e) => updateField(index, 'min', e.target.value ? Number(e.target.value) : undefined)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t('adminCategoryFields.maxValue')}</label>
                        <input
                          type="number"
                          value={field.max || ''}
                          onChange={(e) => updateField(index, 'max', e.target.value ? Number(e.target.value) : undefined)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                        />
                      </div>
                    </div>
                  )}

                  {/* Select field specific options */}
                  {field.type === 'select' && (
                    <div className="mt-4">
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-slate-700">{t('adminCategoryFields.options')}</label>
                        <button
                          onClick={() => addOption(index)}
                          className="px-3 py-1 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800"
                        >{t('adminCategoryFields.addOption')}</button>
                      </div>
                      <div className="space-y-2">
                        {field.options?.map((option, optionIndex) => (
                          <div key={optionIndex} className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={option}
                              onChange={(e) => updateOption(index, optionIndex, e.target.value)}
                              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                              placeholder={`Option ${optionIndex + 1}`}
                            />
                            <button
                              onClick={() => removeOption(index, optionIndex)}
                              className="px-2 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >{t('adminCategoryFields.remove')}</button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={field.multiple}
                            onChange={(e) => updateField(index, 'multiple', e.target.checked)}
                            className="mr-2"
                          />
                          <span className="text-sm font-medium text-slate-700">{t('adminCategoryFields.allowMultipleSelections')}</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Text field specific options */}
                  {field.type === 'text' && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Validation Pattern (Regex)
                      </label>
                      <input
                        type="text"
                        value={field.pattern}
                        onChange={(e) => updateField(index, 'pattern', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                        placeholder="e.g., ^[A-Za-z0-9]+$"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-slate-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-slate-600">
              {fields.length} field{fields.length !== 1 ? 's' : ''} configured
            </div>
            <button
              onClick={saveFields}
              disabled={saving}
              className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Fields'}
            </button>
          </div>
        </div>
      </div>

      {/* The server refused because removing a field would hide values already
          recorded against it. Those values stay in the database but nothing
          renders them, so this is a decision worth naming rather than a save
          that quietly succeeds. */}
      {pendingDataLoss && (
        <div className="fixed inset-0 !mt-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={t('adminCategoryFields.cancel')}
            onClick={() => setPendingDataLoss(null)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-base font-semibold text-slate-900">{t('adminCategoryFields.thisWillHideDataYouAlready')}</h2>
            <p className="text-sm text-slate-600 mt-2">{pendingDataLoss.message}</p>

            <ul className="mt-4 space-y-1.5">
              {pendingDataLoss.removed.map((r) => (
                <li
                  key={r.key}
                  className="flex items-center justify-between text-sm border border-slate-200 rounded-lg px-3 py-2"
                >
                  <span className="font-medium text-slate-800">{r.label}</span>
                  <span className="text-slate-500 tabular-nums">
                    {formatNumber(r.count)} propert{r.count === 1 ? 'y' : 'ies'}
                  </span>
                </li>
              ))}
            </ul>

            <p className="text-xs text-slate-500 mt-3">{t('adminCategoryFields.theValuesStayInTheDatabase')}</p>

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setPendingDataLoss(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
              >{t('adminCategoryFields.keepTheFields')}</button>
              <button
                type="button"
                disabled={saving}
                onClick={() => saveFields({ force: true })}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white transition-colors disabled:opacity-60"
              >{t('adminCategoryFields.removeThemAnyway')}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}