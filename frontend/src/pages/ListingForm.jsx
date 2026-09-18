import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  HiOutlineArrowLeft,
  HiOutlineCheck,
  HiOutlineExclamationCircle,
  HiOutlineLocationMarker,
  HiOutlineSearch,
} from 'react-icons/hi';
import { useListingForm } from '../hooks/useListingForm';
import { useAddressGeocoding } from '../hooks/useAddressGeocoding';
import { useTenant } from '../contexts/TenantProvider';
import ListingMapPicker from '../components/listing/ListingMapPicker';
import ListingImages from '../components/listing/ListingImages';
import OwnerSelector from '../components/listing/OwnerSelector';
import DynamicCategoryFields from '../components/DynamicCategoryFields';
import PropertyDocuments from '../components/PropertyDocuments';
import VoiceNotePanel from '../components/VoiceNotePanel';
import { Button, Input, Select, Textarea, Spinner, PageHeader, Badge } from '../design-system';
import { areaUnit, getLocaleConfig } from '../utils/currency';
import { useTranslation } from 'react-i18next';

/**
 * Add or edit a property — one form for both.
 *
 * It replaces CreateListing (1,775 lines) and UpdateListing (1,158), which were
 * the same form written twice and had drifted apart: camera capture existed
 * only when adding, documents and voice notes only when editing, and each
 * carried its own copy of the map, the geocoding and the owner picker.
 *
 * Only three things actually differ between the two, and `mode` covers all of
 * them: where the initial values come from, which endpoint saves, and which
 * extras exist once there is a record to attach them to.
 */

const STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'under_negotiation', label: 'Under negotiation' },
  { value: 'sold', label: 'Sold' },
  { value: 'rented', label: 'Rented' },
];

function Section({ title, description, children, aside }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description && <p className="text-sm text-slate-500 mt-0.5 max-w-prose">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function ListingForm({ mode = 'create' }) {
  const { t } = useTranslation();
  const params = useParams();
  const listingId = params.listingId;
  const { tenant } = useTenant();

  const {
    form, setField, patch, setCategoryField, categoryFieldValue,
    categories, selectedCategory, owners, setOwners, propertyTypes, selectedPropertyType,
    loading, saving, error, loadError, submit, isEdit,
  } = useListingForm({ mode, listingId });

  const [mapLayer, setMapLayer] = useState('street');

  const geo = useAddressGeocoding(patch);

  const currency = tenant?.locale?.currency || 'INR';

  /*
   * Area, in whichever of the six units the workspace uses.
   *
   * This was a two-way ternary — `areaUnit === 'sqft' ? 'sq ft' : 'sq yard'` —
   * so a workspace set to sqm, acre, cent or guntha silently showed and stored
   * square yards. Only sqft and sqyard have native columns, so the other four
   * are converted to and from areaSqFt on the way in and out; existing sqft and
   * sqYard data is written to the same column it always was.
   */
  const unit = areaUnit();
  const usesSqYardColumn = getLocaleConfig().areaUnit === 'sqyard';

  const areaValue = usesSqYardColumn
    ? form.sqYard
    : Math.round(((form.areaSqFt || 0) / unit.inSqft) * 100) / 100;

  const setAreaValue = (next) => {
    if (usesSqYardColumn) setField('sqYard', next);
    else setField('areaSqFt', Math.round(next * unit.inSqft));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-lg mx-auto text-center py-24">
        <HiOutlineExclamationCircle className="w-10 h-10 text-rose-400 mx-auto" />
        <h1 className="text-lg font-semibold text-slate-900 mt-3">{loadError}</h1>
        <Button className="mt-5" variant="secondary" icon={HiOutlineArrowLeft} onClick={() => window.history.back()}>{t('listingForm.goBack')}</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5 max-w-5xl">
      <PageHeader
        title={isEdit ? 'Edit property' : 'Add a property'}
        description={
          isEdit
            ? 'Changes are saved when you press Save.'
            : 'Only a name is required — everything else can be filled in later.'
        }
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => window.history.back()}>{t('listingForm.cancel')}</Button>
            <Button type="submit" icon={HiOutlineCheck} loading={saving}>
              {isEdit ? 'Save changes' : 'Add property'}
            </Button>
          </>
        }
      />

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <HiOutlineExclamationCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-rose-900">{error}</p>
        </div>
      )}

      {/* ── The basics ───────────────────────────────────────────────────── */}
      <Section
        title={t('listingForm.theProperty')}
        description={t('listingForm.whatItIsAndWhereIt')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t('listingForm.name')}
            required
            autoFocus={!isEdit}
            className="sm:col-span-2"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder={t('listingForm.plot214AmohaGardens')}
          />

          <Select
            label={t('listingForm.category')}
            value={form.category}
            onChange={(e) => setField('category', e.target.value)}
            hint="Decides which extra fields this property collects."
          >
            <option value="">{t('listingForm.noCategory')}</option>
            {categories.map((c) => (
              <option key={c._id} value={c.slug}>{c.name}</option>
            ))}
          </Select>

          <Select
            label={t('listingForm.propertyType')}
            value={form.propertyType}
            onChange={(e) => setField('propertyType', e.target.value)}
            hint={selectedPropertyType?.description || 'Decides how this property is classified in filters and reports.'}
          >
            <option value="">{t('listingForm.notSpecified')}</option>
            {propertyTypes.map((t) => (
              <option key={t._id} value={t.slug}>
                {t.icon ? `${t.icon} ` : ''}{t.name}
              </option>
            ))}
          </Select>

          <Select label={t('listingForm.listingType')} value={form.type} onChange={(e) => setField('type', e.target.value)}>
            <option value="sale">{t('listingForm.forSale')}</option>
            <option value="rent">{t('listingForm.forRent')}</option>
            <option value="lease">{t('listingForm.forLease')}</option>
          </Select>

          <Select label={t('listingForm.status')} value={form.status} onChange={(e) => setField('status', e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>

          <Input
            label={t('listingForm.propertyPlotNo')}
            value={form.propertyNo}
            onChange={(e) => setField('propertyNo', e.target.value)}
            hint="Used to recognise this property on re-import."
          />

          <Textarea
            label={t('listingForm.description')}
            className="sm:col-span-2"
            rows={3}
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
          />
        </div>
      </Section>

      {/* ── Where it is ──────────────────────────────────────────────────── */}
      <Section
        title={t('listingForm.whereItIs')}
        description={t('listingForm.typeAnAddressToPlaceIt')}
        aside={geo.status ? <Badge variant={geo.geocoding ? 'info' : 'success'}>{geo.status}</Badge> : null}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div className="relative">
              <Input
                label={t('listingForm.address')}
                value={form.address}
                onChange={(e) => {
                  setField('address', e.target.value);
                  geo.onAddressInput(e.target.value);
                }}
                onKeyDown={geo.onAddressKeyDown}
                onBlur={() => setTimeout(geo.dismissSuggestions, 150)}
                icon={HiOutlineSearch}
                placeholder={t('listingForm.startTypingAnAddress')}
              />
              {geo.showSuggestions && geo.suggestions.length > 0 && (
                <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {geo.suggestions.map((s, i) => (
                    <li key={`${s.lat}-${s.lng}-${i}`}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => geo.chooseSuggestion(s)}
                        className={`w-full text-left px-3 py-2 text-sm flex items-start gap-2 transition-colors ${
                          i === geo.activeIndex ? 'bg-slate-100' : 'hover:bg-slate-50'
                        }`}
                      >
                        <HiOutlineLocationMarker className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                        <span className="text-slate-700">{s.address || s.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label={t('listingForm.areaColony')} value={form.areaName} onChange={(e) => setField('areaName', e.target.value)} />
              <Input label={t('listingForm.localitySector')} value={form.locality} onChange={(e) => setField('locality', e.target.value)} />
              <Input label={t('listingForm.city')} value={form.city} onChange={(e) => setField('city', e.target.value)} />
              <Input label={t('listingForm.state')} value={form.state} onChange={(e) => setField('state', e.target.value)} />
              <Input label={t('listingForm.pincode')} value={form.pincode} onChange={(e) => setField('pincode', e.target.value)} />
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  icon={HiOutlineLocationMarker}
                  loading={geo.geocoding}
                  disabled={!form.address}
                  onClick={() => geo.geocodeAddress(form.address)}
                >{t('listingForm.findOnMap')}</Button>
              </div>
            </div>
          </div>

          <ListingMapPicker
            location={form.location}
            layer={mapLayer}
            onLayer={setMapLayer}
            onSelect={(lat, lng) => {
              setField('location', { lat, lng });
              geo.reverseGeocode(lat, lng);
            }}
            height="h-[22rem]"
          />
        </div>
      </Section>

      {/* ── Price and size ───────────────────────────────────────────────── */}
      <Section title="Price &amp; size" description={`Amounts in ${currency}.`}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Input
            label={t('listingForm.price')}
            type="number"
            min={0}
            value={form.regularPrice}
            onChange={(e) => setField('regularPrice', Number(e.target.value))}
          />
          <Input
            label={t('listingForm.offerPrice')}
            type="number"
            min={0}
            hint="Must be below the price."
            value={form.discountPrice}
            onChange={(e) => setField('discountPrice', Number(e.target.value))}
          />
          <Input
            label={`Area (${unit.label})`}
            type="number"
            min={0}
            value={areaValue}
            onChange={(e) => setAreaValue(Number(e.target.value))}
          />
          <Input
            label={`Rate per ${unit.label}`}
            type="number"
            min={0}
            value={form.sqYardRate}
            onChange={(e) => setField('sqYardRate', Number(e.target.value))}
          />
          <Input label={t('listingForm.plotSize')} value={form.plotSize} onChange={(e) => setField('plotSize', e.target.value)} placeholder={t('listingForm.30x50')} />
          <Input
            label={t('listingForm.totalValue')}
            type="number"
            min={0}
            value={form.totalValue}
            onChange={(e) => setField('totalValue', Number(e.target.value))}
          />
          <Input
            label={t('listingForm.bedrooms')}
            type="number"
            min={0}
            value={form.bedrooms}
            onChange={(e) => setField('bedrooms', Number(e.target.value))}
          />
          <Input
            label={t('listingForm.bathrooms')}
            type="number"
            min={0}
            value={form.bathrooms}
            onChange={(e) => setField('bathrooms', Number(e.target.value))}
          />
        </div>

        <div className="flex flex-wrap gap-5 mt-4 pt-4 border-t border-slate-100">
          {[
            ['offer', 'On offer'],
            ['parking', 'Parking'],
            ['furnished', 'Furnished'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form[key])}
                onChange={(e) => setField(key, e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              {label}
            </label>
          ))}
        </div>
      </Section>

      {/* ── Category fields ──────────────────────────────────────────────── */}
      {selectedCategory?.fields?.length > 0 && (
        <Section
          title={`${selectedCategory.name} details`}
          description={t('listingForm.extraFieldsYourWorkspaceCollectsFor')}
        >
          <DynamicCategoryFields
            fields={selectedCategory.fields}
            values={Object.fromEntries(
              selectedCategory.fields.map((f) => [f.key, categoryFieldValue(f.key)])
            )}
            onChange={setCategoryField}
          />
        </Section>
      )}

      {/* ── Photos ───────────────────────────────────────────────────────── */}
      <Section title={t('listingForm.photos')} description={t('listingForm.theFirstOneIsUsedEverywhere')}>
        <ListingImages urls={form.imageUrls} onChange={(urls) => setField('imageUrls', urls)} />
      </Section>

      {/* ── Owners ───────────────────────────────────────────────────────── */}
      <Section title={t('listingForm.owners')} description={t('listingForm.whoThisPropertyBelongsToA')}>
        <OwnerSelector
          owners={owners}
          selectedIds={form.ownerIds}
          onChange={(ids) => setField('ownerIds', ids)}
          onOwnerCreated={(owner) => setOwners((prev) => [owner, ...prev])}
        />
      </Section>

      {/* ── Notes ────────────────────────────────────────────────────────── */}
      <Section title={t('listingForm.internalNotes')} description={t('listingForm.onlyYourTeamSeesThese')}>
        <Textarea rows={3} value={form.remarks} onChange={(e) => setField('remarks', e.target.value)} />
      </Section>

      {/* Documents and voice notes need a record to attach to, so they appear
          only when editing — the one genuine difference between the two modes,
          rather than the accidental ones the split forms had. */}
      {isEdit && (
        <>
          <Section title={t('listingForm.documents')} description={t('listingForm.agreementsTitlePapersApprovals')}>
            <PropertyDocuments listingId={listingId} canEdit />
          </Section>
          <Section title={t('listingForm.voiceNotes')} description={t('listingForm.aQuickSpokenNoteBeatsOne')}>
            <VoiceNotePanel listingId={listingId} initialNotes={form.voiceNotes || []} />
          </Section>
        </>
      )}

      <div className="sticky bottom-4 bg-white border border-slate-200 rounded-xl shadow-lg px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-slate-500">
          {isEdit ? 'Editing an existing property.' : 'Only a name is required to save.'}
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => window.history.back()}>{t('listingForm.cancel')}</Button>
          <Button type="submit" icon={HiOutlineCheck} loading={saving}>
            {isEdit ? 'Save changes' : 'Add property'}
          </Button>
        </div>
      </div>
    </form>
  );
}
