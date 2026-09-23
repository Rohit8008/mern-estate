import { useEffect, useState } from 'react';
import {
  HiOutlineCheck,
  HiOutlineClipboardCopy,
  HiOutlineExternalLink,
  HiOutlineShare,
} from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { Button, Input, Select, Modal, Badge } from '../design-system';
import { formatDate } from '../utils/currency';
import { useTranslation } from 'react-i18next';

/**
 * Sending properties to someone outside the agency.
 *
 * The property book is not public, so this is the only way anything leaves it.
 * The defaults are chosen so that an agent who fills in nothing still gets a
 * link that expires — the failure worth designing against is a link that keeps
 * working long after the deal closed and the recipient has forwarded it on.
 */

const EXPIRY_CHOICES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 'never', label: 'No expiry' },
];

export default function SharePropertiesDialog({ open, onClose, listings = [] }) {
  const { t } = useTranslation();
  const { showError, showSuccess } = useNotification();

  const [form, setForm] = useState({
    label: '', recipientName: '', recipientPhone: '',
    message: '', expiryDays: 30, showPrice: true, passcode: '',
  });
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  // Which of the offered properties go into the link. Everything in the view
  // used to be sent with no way to leave one out, sold ones included; sold and
  // rented start unticked.
  const idOf = (l) => String(l._id || l.id);
  const [picked, setPicked] = useState(() => new Set());
  // Keyed on the ids, not the array: a parent passing a fresh array each
  // render would otherwise reset the ticks on every click.
  const listingKey = listings.map(idOf).join(',');
  useEffect(() => {
    if (open) setPicked(new Set(listings.filter((l) => !['sold', 'rented'].includes(l.status)).map(idOf)));
  }, [open, listingKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = listings.filter((l) => picked.has(idOf(l)));
  const togglePick = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  useEffect(() => {
    if (!open) {
      setForm({ label: '', recipientName: '', recipientPhone: '', message: '', expiryDays: 30, showPrice: true, passcode: '' });
      setResult(null);
      setCopied(false);
    }
  }, [open]);

  const shareUrl = result ? `${window.location.origin}/s/${result.share.token}` : '';

  async function create() {
    setCreating(true);
    try {
      const res = await apiClient.post('/share', {
        listingIds: chosen.map(idOf),
        label: form.label.trim(),
        recipientName: form.recipientName.trim(),
        recipientPhone: form.recipientPhone.trim(),
        message: form.message.trim(),
        showPrice: form.showPrice,
        expiryDays: form.expiryDays === 'never' ? null : Number(form.expiryDays),
        passcode: form.passcode.trim() || undefined,
      });
      setResult(res.data);
    } catch (err) {
      showError(err?.message || 'Could not create that link.');
    } finally {
      setCreating(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      showSuccess('Select the link and copy it.');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={result ? 'Link ready' : `Share ${chosen.length} propert${chosen.length === 1 ? 'y' : 'ies'}`}
    >
      {result ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-700"
              />
              <Button
                type="button"
                variant={copied ? 'secondary' : 'primary'}
                icon={copied ? HiOutlineCheck : HiOutlineClipboardCopy}
                onClick={copy}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>

          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t('shareProperties.properties')}</dt>
              <dd className="font-medium text-slate-900">{result.share.listingIds.length}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t('shareProperties.expires')}</dt>
              <dd className="font-medium text-slate-900">
                {result.share.expiresAt
                  ? formatDate(result.share.expiresAt)
                  : 'Never — withdraw it manually when you are done'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t('shareProperties.priceShown')}</dt>
              <dd className="font-medium text-slate-900">{result.share.showPrice ? 'Yes' : 'Hidden'}</dd>
            </div>
            {result.share.hasPasscode && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t('shareProperties.passcode')}</dt>
                <dd><Badge variant="brand" size="xs">{t('shareProperties.required')}</Badge></dd>
              </div>
            )}
          </dl>

          <p className="text-xs text-slate-500">
            Anyone with this link can see these properties — no account needed. It shows
            photos, location and details, never owner contacts or your internal notes.
            You can withdraw it at any time.
          </p>

          <div className="flex justify-between gap-2">
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
            >
              <HiOutlineExternalLink className="w-4 h-4" />{t('shareProperties.seeWhatTheyWillSee')}</a>
            <Button onClick={onClose}>{t('shareProperties.done')}</Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
          className="space-y-4"
        >
          <fieldset className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 max-h-44 overflow-y-auto">
            <legend className="sr-only">Properties in this link</legend>
            {listings.map((l) => {
              const id = idOf(l);
              const inactive = ['sold', 'rented'].includes(l.status);
              return (
                <label key={id} className="flex items-center gap-2 py-1 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={picked.has(id)}
                    onChange={() => togglePick(id)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="truncate">{l.name}</span>
                  {inactive && <span className="ml-auto text-xs text-slate-500 flex-shrink-0">{l.status === 'sold' ? 'Sold' : 'Rented'}</span>}
                </label>
              );
            })}
          </fieldset>

          <Input
            label={t('shareProperties.whatIsThisList')}
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder={t('shareProperties.plotsNearSector21ForMr')}
            hint="Shown at the top of the page they open."
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('shareProperties.sentTo')}
              value={form.recipientName}
              onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
              hint="Your note — not shown to them."
            />
            <Input
              label={t('shareProperties.theirPhone')}
              value={form.recipientPhone}
              onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })}
            />
          </div>

          <Input
            label={t('shareProperties.message')}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder={t('shareProperties.hereAreTheThreeWeDiscussed')}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t('shareProperties.linkExpiresIn')}
              value={String(form.expiryDays)}
              onChange={(e) => setForm({ ...form, expiryDays: e.target.value })}
              hint="A link that never expires is one still working next year."
            >
              {EXPIRY_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
            <Input
              label={t('shareProperties.passcode')}
              value={form.passcode}
              onChange={(e) => setForm({ ...form, passcode: e.target.value })}
              placeholder={t('shareProperties.optional')}
              hint="For a link going somewhere sensitive."
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.showPrice}
              onChange={(e) => setForm({ ...form, showPrice: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />{t('shareProperties.showThePrice')}</label>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>{t('shareProperties.cancel')}</Button>
            <Button type="submit" icon={HiOutlineShare} loading={creating} disabled={!chosen.length}>{t('shareProperties.createLink')}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
