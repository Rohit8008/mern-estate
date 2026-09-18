import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlineBell,
  HiOutlineCheck,
  HiOutlineUserAdd,
  HiOutlineViewBoards,
  HiOutlineClipboardCheck,
  HiOutlineClock,
  HiOutlineHome,
  HiOutlineChat,
  HiOutlineExclamation,
  HiOutlineUpload,
  HiOutlineEye,
} from 'react-icons/hi';
import { PageHeader, Button, EmptyState, Spinner } from '../design-system';
import { useNotificationFeed } from '../contexts/NotificationFeedProvider';
import usePageTitle from '../hooks/usePageTitle';
import { useTranslation } from 'react-i18next';

/**
 * The full notification history.
 *
 * The bell shows the ten most recent; this is where the rest lives, with a
 * read/unread filter. Icons and colours are literal strings per type — Tailwind
 * scans source as plain text, so an interpolated class name is never emitted.
 */

const TYPE_META = {
  'lead.assigned':      { icon: HiOutlineUserAdd,        ring: 'bg-indigo-50 text-indigo-600',  label: 'Lead' },
  'deal.stage_changed': { icon: HiOutlineViewBoards,     ring: 'bg-emerald-50 text-emerald-600', label: 'Deal' },
  'task.assigned':      { icon: HiOutlineClipboardCheck, ring: 'bg-blue-50 text-blue-600',      label: 'Task' },
  'task.due':           { icon: HiOutlineClock,          ring: 'bg-amber-50 text-amber-600',    label: 'Task' },
  'followup.due':       { icon: HiOutlineClock,          ring: 'bg-amber-50 text-amber-600',    label: 'Follow-up' },
  'buyer.match':        { icon: HiOutlineHome,           ring: 'bg-violet-50 text-violet-600',  label: 'Buyer' },
  'message.received':   { icon: HiOutlineChat,           ring: 'bg-sky-50 text-sky-600',        label: 'Message' },
  'import.finished':    { icon: HiOutlineUpload,         ring: 'bg-slate-100 text-slate-600',   label: 'Import' },
  'share.viewed':       { icon: HiOutlineEye,            ring: 'bg-slate-100 text-slate-600',   label: 'Share' },
  'listing.updated':    { icon: HiOutlineHome,           ring: 'bg-slate-100 text-slate-600',   label: 'Listing' },
  'system.alert':       { icon: HiOutlineExclamation,    ring: 'bg-rose-50 text-rose-600',      label: 'System' },
};

const FALLBACK_META = { icon: HiOutlineBell, ring: 'bg-slate-100 text-slate-600', label: 'Notice' };

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Notifications() {
  const { t } = useTranslation();
  usePageTitle('Notifications');

  const { items, unread, total, loading, hasMore, load, loadMore, markRead, markAllRead } =
    useNotificationFeed();
  const [filter, setFilter] = useState('all');

  // Always refetch on mount: the provider may hold a list from an earlier visit.
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(
    () => (filter === 'unread' ? items.filter((n) => !n.readAt) : items),
    [items, filter]
  );

  return (
    <div className='min-h-screen bg-slate-50'>
      <div className='max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5'>
        <PageHeader
          title={t('notifications.notifications')}
          description={unread > 0 ? `${unread} unread of ${total}` : `${total} in the last 90 days`}
          actions={
            unread > 0 ? (
              <Button variant='secondary' onClick={() => markAllRead()}>
                <HiOutlineCheck className='w-4 h-4' />{t('notifications.markAllRead')}</Button>
            ) : null
          }
        />

        <div className='flex items-center gap-2'>
          {[
            { id: 'all', label: `All${total ? ` (${total})` : ''}` },
            { id: 'unread', label: `Unread${unread ? ` (${unread})` : ''}` },
          ].map((tab) => (
            <button
              key={tab.id}
              type='button'
              onClick={() => setFilter(tab.id)}
              className={
                filter === tab.id
                  ? 'px-3.5 py-1.5 rounded-lg text-sm font-medium bg-slate-900 text-white'
                  : 'px-3.5 py-1.5 rounded-lg text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className='bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden'>
          {loading && !items.length ? (
            <div className='py-16 flex justify-center'><Spinner /></div>
          ) : !visible.length ? (
            <EmptyState
              icon={HiOutlineBell}
              title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}
              body={
                filter === 'unread'
                  ? 'You are all caught up.'
                  : 'Assignments, deal moves and reminders will appear here.'
              }
            />
          ) : (
            <ul className='divide-y divide-slate-100'>
              {visible.map((n) => {
                const meta = TYPE_META[n.type] || FALLBACK_META;
                const Icon = meta.icon;

                const row = (
                  <div className={`flex items-start gap-3.5 px-5 py-4 transition-colors ${n.readAt ? '' : 'bg-indigo-50/40'}`}>
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.ring}`}>
                      <Icon className='w-5 h-5' />
                    </span>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-baseline gap-2 flex-wrap'>
                        <span className='text-sm font-medium text-slate-900'>{n.title}</span>
                        {!n.readAt && (
                          <span className='text-[0.625rem] font-semibold uppercase tracking-wide text-indigo-600'>{t('notifications.new')}</span>
                        )}
                      </div>
                      {n.body && <p className='text-sm text-slate-500 mt-0.5'>{n.body}</p>}
                      <p className='text-xs text-slate-400 mt-1'>
                        {meta.label} &middot; {formatWhen(n.createdAt)}
                      </p>
                    </div>
                    {!n.readAt && (
                      <button
                        type='button'
                        onClick={(e) => { e.preventDefault(); markRead(n._id); }}
                        className='text-xs text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0'
                        title={t('notifications.markAsRead')}
                      >
                        <HiOutlineCheck className='w-4 h-4' />
                      </button>
                    )}
                  </div>
                );

                return (
                  <li key={n._id}>
                    {n.link ? (
                      <Link
                        to={n.link}
                        onClick={() => { if (!n.readAt) markRead(n._id); }}
                        className='block hover:bg-slate-50 transition-colors'
                      >
                        {row}
                      </Link>
                    ) : row}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Paging applies to the fetched list, so it is offered on the "all" view. */}
        {filter === 'all' && hasMore && (
          <div className='flex justify-center'>
            <Button variant='secondary' onClick={loadMore} disabled={loading}>
              {loading ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
