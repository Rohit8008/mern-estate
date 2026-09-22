import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  HiOutlineAdjustments,
  HiOutlineCollection,
  HiOutlineExclamation,
  HiOutlineOfficeBuilding,
  HiOutlinePencil,
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlineTable,
  HiOutlineTrash,
  HiOutlineUpload,
  HiOutlineX,
} from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { usePermissions } from '../contexts/PermissionsContext';
import { useNotification } from '../contexts/NotificationContext';
import { Button, Input, Modal, PageHeader, EmptyState } from '../design-system';
import { formatNumber } from '../utils/currency';
import { useTranslation } from 'react-i18next';

/**
 * The colonies, projects and property groups this agency deals in.
 *
 * A category is the unit an agent actually thinks in — "Amoha Gardens",
 * "Sector 57" — and it decides which extra fields a property in it collects. So
 * the card leads with how much stock sits in each one and which fields it
 * defines: those are the two things that make "can I delete this?" and "is this
 * set up yet?" answerable without opening anything.
 */

function cx(...xs) {
  return xs.filter(Boolean).join(' ');
}

function slugPreview(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ─── One category ─────────────────────────────────────────────────────────────

function CategoryCard({ category, hasPerm, onDelete, onRename, deleting }) {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(category.name);
  const [savingName, setSavingName] = useState(false);

  const inUse = category.listingCount || 0;
  const fieldCount = category.fields?.length || 0;

  async function saveName() {
    const next = draft.trim();
    if (!next || next === category.name) {
      setRenaming(false);
      setDraft(category.name);
      return;
    }
    setSavingName(true);
    const ok = await onRename(category, next);
    setSavingName(false);
    if (ok) setRenaming(false);
    else setDraft(category.name);
  }

  return (
    <div className="group bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all flex flex-col">
      <div className="p-4 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <input
                autoFocus
                value={draft}
                maxLength={50}
                disabled={savingName}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName();
                  if (e.key === 'Escape') { setDraft(category.name); setRenaming(false); }
                }}
                className="w-full text-sm font-semibold text-slate-900 border border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="text-sm font-semibold text-slate-900 truncate">{category.name}</h2>
                {hasPerm('updateCategory') && (
                  <button
                    type="button"
                    onClick={() => setRenaming(true)}
                    aria-label={`Rename ${category.name}`}
                    className="text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex-shrink-0"
                  >
                    <HiOutlinePencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
            {/* The address never changes on rename — properties refer to their
                category by it, so changing it would orphan every one of them. */}
            <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">{category.slug}</p>
          </div>

          <div className="text-right flex-shrink-0">
            <div className="text-lg font-semibold text-slate-900 tabular-nums leading-none">
              {formatNumber(inUse)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {inUse === 1 ? 'property' : 'properties'}
            </div>
          </div>
        </div>

        {/* Which details this category asks for. "None" is worth saying — such a
            category collects nothing beyond the built-in fields. */}
        <div className="mt-3">
          {fieldCount === 0 ? (
            <p className="text-xs text-slate-400">
              No custom fields.{' '}
              {hasPerm('updateCategory') && (
                <Link to={`/admin/categories/${category.slug}/fields`} className="text-indigo-600 hover:underline">{t('categories.addSome')}</Link>
              )}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {category.fields.slice(0, 4).map((f) => (
                <span
                  key={f.key}
                  className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-[11px] text-slate-600"
                >
                  {f.label}
                  {f.required && <span className="text-rose-400 ml-0.5">*</span>}
                </span>
              ))}
              {fieldCount > 4 && (
                <span className="px-2 py-0.5 text-[11px] text-slate-400">+{fieldCount - 4}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5">
          <Link
            to={`/properties?category=${encodeURIComponent(category.slug)}`}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
          >
            <HiOutlineOfficeBuilding className="w-3.5 h-3.5" />{t('categories.properties')}</Link>
          <Link
            to={`/dynamic-listings/${category.slug}`}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
          >
            <HiOutlineTable className="w-3.5 h-3.5" />{t('categories.table')}</Link>
          {hasPerm('updateCategory') && (
            <Link
              to={`/admin/categories/${category.slug}/fields`}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-white transition-colors"
            >
              <HiOutlineAdjustments className="w-3.5 h-3.5" />{t('categories.setUp')}</Link>
          )}
        </div>

        {hasPerm('deleteCategory') && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {confirmDelete && (
              <span className="text-[11px] text-rose-600 font-medium whitespace-nowrap">
                {inUse > 0 ? `${inUse} in use —` : ''} sure?
              </span>
            )}
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  setTimeout(() => setConfirmDelete(false), 4000);
                  return;
                }
                onDelete(category);
                setConfirmDelete(false);
              }}
              className={cx(
                'p-1.5 rounded-md transition-colors disabled:opacity-50',
                confirmDelete
                  ? 'bg-rose-600 text-white hover:bg-rose-700'
                  : 'text-slate-400 hover:text-rose-600 hover:bg-white'
              )}
              aria-label={`Delete ${category.name}`}
            >
              <HiOutlineTrash className="w-3.5 h-3.5" />
            </button>
            {confirmDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-white"
                aria-label={t('categories.cancel')}
              >
                <HiOutlineX className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Categories() {
  const { t } = useTranslation();
  const { currentUser } = useSelector((state) => state.user);
  const { can: hasPerm } = usePermissions();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();

  const [categories, setCategories] = useState(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [blockedDelete, setBlockedDelete] = useState(null);

  useEffect(() => {
    apiClient
      .get('/category/list')
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch((e) => {
        setCategories([]);
        showError(e?.message || 'Could not load your categories.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    const list = categories || [];
    return {
      count: list.length,
      properties: list.reduce((n, c) => n + (c.listingCount || 0), 0),
      unconfigured: list.filter((c) => !c.fields?.length).length,
    };
  }, [categories]);

  const shown = useMemo(() => {
    const list = categories || [];
    const q = query.trim().toLowerCase();
    const filtered = q ? list.filter((c) => `${c.name} ${c.slug}`.toLowerCase().includes(q)) : list;
    // Busiest first — the categories carrying stock are the ones people open.
    return [...filtered].sort((a, b) => (b.listingCount || 0) - (a.listingCount || 0));
  }, [categories, query]);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const created = await apiClient.post('/category/create', { name });
      setCategories((prev) => [{ ...created, listingCount: 0 }, ...(prev || [])]);
      setNewName('');
      setCreating(false);
      showSuccess(`"${created.name}" created. Set up its fields next.`);
    } catch (e) {
      showError(e?.message || 'Could not create that category.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(category, { force = false } = {}) {
    setDeletingId(category._id);
    try {
      await apiClient.delete(`/category/delete/${category._id}${force ? '?force=true' : ''}`);
      setCategories((prev) => prev.filter((c) => c._id !== category._id));
      showSuccess(`"${category.name}" deleted.`);
    } catch (e) {
      // The server refuses to delete a category properties still use, and says
      // how many. That is information to act on, not a failure to re-read.
      if (e?.statusCode === 409) setBlockedDelete({ category, message: e.message });
      else showError(e?.message || 'Could not delete that category.');
    } finally {
      setDeletingId('');
    }
  }

  async function rename(category, name) {
    try {
      const updated = await apiClient.patch(`/category/${category._id}`, { name });
      setCategories((prev) => prev.map((c) => (c._id === category._id ? { ...c, name: updated.name } : c)));
      showSuccess(`Renamed to "${updated.name}".`);
      return true;
    } catch (e) {
      showError(e?.message || 'Could not rename that category.');
      return false;
    }
  }

  const loading = categories === null;
  const isEmpty = !loading && categories.length === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('categories.categories')}
        description={
          loading
            ? 'Loading…'
            : isEmpty
              ? 'The colonies, projects and property groups you deal in.'
              : `${totals.count} ${totals.count === 1 ? 'category' : 'categories'} · ${formatNumber(totals.properties)} propert${totals.properties === 1 ? 'y' : 'ies'}`
        }
        actions={
          <>
            {currentUser?.role === 'admin' && (
              <Button variant="secondary" icon={HiOutlineUpload} onClick={() => navigate('/admin/import')}>{t('categories.import')}</Button>
            )}
            {hasPerm('createCategory') && (
              <Button icon={HiOutlinePlus} onClick={() => setCreating(true)}>{t('categories.newCategory')}</Button>
            )}
          </>
        }
      />

      {/* A nudge, not a nag — shown only while something is genuinely unfinished. */}
      {!loading && totals.count > 0 && totals.unconfigured > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <HiOutlineExclamation className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">
            {totals.unconfigured === 1 ? 'One category has' : `${totals.unconfigured} categories have`}{' '}
            no custom fields yet, so properties in {totals.unconfigured === 1 ? 'it' : 'them'} record
            only the built-in details. Use <strong>{t('categories.setUp')}</strong>{t('categories.onACardToAddFields')}</p>
        </div>
      )}

      {/* Search earns its place only once scanning stops being enough. */}
      {!loading && categories.length > 6 && (
        <div className="relative max-w-sm">
          <HiOutlineSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('categories.findACategory')}
            className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={t('categories.clear')}
            >
              <HiOutlineX className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse">
              <div className="flex justify-between gap-3">
                <div className="flex-1">
                  <div className="h-3.5 bg-slate-100 rounded w-2/3 mb-2" />
                  <div className="h-2.5 bg-slate-100 rounded w-1/3" />
                </div>
                <div className="h-6 w-8 bg-slate-100 rounded" />
              </div>
              <div className="flex gap-1 mt-4">
                <div className="h-5 w-16 bg-slate-100 rounded-md" />
                <div className="h-5 w-14 bg-slate-100 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The first screen on a new workspace, so it explains what a category is
          for rather than only reporting that there are none. */}
      {isEmpty && (
        <div className="bg-white border border-slate-200 rounded-xl">
          <EmptyState
            icon={HiOutlineCollection}
            title={t('categories.startWithACategory')}
            body={
              hasPerm('createCategory')
                ? 'A category is a colony, project or group of properties — "Amoha Gardens", "Sector 57". It decides which extra details a property in it records: plot size, facing, khasra number.'
                : 'No categories have been set up yet. Ask an administrator to add one.'
            }
            action={
              hasPerm('createCategory') ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button icon={HiOutlinePlus} onClick={() => setCreating(true)}>{t('categories.createTheFirstOne')}</Button>
                  {currentUser?.role === 'admin' && (
                    <Button variant="secondary" icon={HiOutlineUpload} onClick={() => navigate('/admin/import')}>{t('categories.orImportASpreadsheet')}</Button>
                  )}
                </div>
              ) : null
            }
          />
        </div>
      )}

      {!loading && categories.length > 0 && shown.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl">
          <EmptyState
            icon={HiOutlineSearch}
            title={t('categories.nothingMatches')}
            body={`No category contains "${query}".`}
            action={<Button variant="secondary" onClick={() => setQuery('')}>{t('categories.clearTheSearch')}</Button>}
          />
        </div>
      )}

      {shown.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((c) => (
            <CategoryCard
              key={c._id}
              category={c}
              hasPerm={hasPerm}
              onDelete={remove}
              onRename={rename}
              deleting={deletingId === c._id}
            />
          ))}
        </div>
      )}

      {/* ── New category ──────────────────────────────────────────────────── */}
      <Modal open={creating} onClose={() => setCreating(false)} title={t('categories.newCategory')}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
          className="space-y-4"
        >
          <Input
            label={t('categories.name')}
            required
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('categories.amohaGardens')}
            hint="The colony, project or group as your team refers to it."
          />
          {newName.trim() && (
            <p className="text-xs text-slate-500">
              Its address will be{' '}
              <span className="font-mono text-slate-700">{slugPreview(newName)}</span>{t('categories.thisNeverChangesEvenIfYou')}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>{t('categories.cancel')}</Button>
            <Button type="submit" loading={saving} disabled={!newName.trim()}>{t('categories.create')}</Button>
          </div>
        </form>
      </Modal>

      {/* ── A delete the server refused ───────────────────────────────────── */}
      <Modal
        open={Boolean(blockedDelete)}
        onClose={() => setBlockedDelete(null)}
        title={blockedDelete ? `Delete "${blockedDelete.category.name}"?` : ''}
      >
        {blockedDelete && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">{blockedDelete.message}</p>
            <p className="text-sm text-slate-500">
              Those properties keep their data, but they will stop showing this category&rsquo;s
              fields and will drop out of its filter.
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                to={`/properties?category=${encodeURIComponent(blockedDelete.category.slug)}`}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
              >{t('categories.seeTheProperties')}</Link>
              <Button variant="secondary" onClick={() => setBlockedDelete(null)}>{t('categories.keepIt')}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  const target = blockedDelete.category;
                  setBlockedDelete(null);
                  remove(target, { force: true });
                }}
              >{t('categories.deleteAnyway')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
