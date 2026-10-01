import { useRef } from 'react';

function cx(...xs) { return xs.filter(Boolean).join(' '); }

const tabId = (id, value) => `${id}-tab-${value}`;
const panelId = (id, value) => `${id}-panel-${value}`;

/**
 * A tab strip. `id` links each tab to its <TabPanel>, so pass the same string
 * to both.
 *
 *   <Tabs id='client' value={tab} onChange={setTab}
 *         items={[{ value: 'overview', label: 'Overview' }, { value: 'docs', label: 'Documents', count: 4 }]} />
 *   <TabPanel tabsId='client' value='overview' active={tab}>…</TabPanel>
 *
 * Roving tabindex per the WAI-ARIA tabs pattern: Tab enters the strip once at
 * the selected tab, and arrows move between tabs, so a keyboard user does not
 * have to walk through every tab to reach the content.
 */
export default function Tabs({ id, items, value, onChange, className }) {
  const listRef = useRef(null);

  const onKeyDown = (e) => {
    const enabled = items.filter((i) => !i.disabled);
    const index = enabled.findIndex((i) => i.value === value);
    let next = null;
    if (e.key === 'ArrowRight') next = enabled[(index + 1) % enabled.length];
    if (e.key === 'ArrowLeft') next = enabled[(index - 1 + enabled.length) % enabled.length];
    if (e.key === 'Home') next = enabled[0];
    if (e.key === 'End') next = enabled[enabled.length - 1];
    if (!next) return;
    e.preventDefault();
    onChange(next.value);
    listRef.current?.querySelector(`#${CSS.escape(tabId(id, next.value))}`)?.focus();
  };

  return (
    <div
      ref={listRef}
      role='tablist'
      onKeyDown={onKeyDown}
      className={cx('flex items-center gap-1 border-b border-border overflow-x-auto scrollbar-thin', className)}
    >
      {items.map((item) => {
        const selected = item.value === value;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            id={tabId(id, item.value)}
            type='button'
            role='tab'
            aria-selected={selected}
            aria-controls={panelId(id, item.value)}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cx(
              'relative inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 rounded-t-md',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {Icon && <Icon className='w-4 h-4' aria-hidden='true' />}
            {item.label}
            {item.count != null && (
              <span className={cx(
                'min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-[0.6875rem] leading-none font-semibold tabular-nums',
                selected ? 'bg-brand-600 text-white' : 'bg-secondary text-muted-foreground'
              )}>
                {item.count}
              </span>
            )}
            {/* The underline is the selection mark — inset so it sits on the strip's border. */}
            <span
              aria-hidden='true'
              className={cx(
                'absolute left-2 right-2 -bottom-px h-0.5 rounded-full transition-colors',
                selected ? 'bg-brand-600' : 'bg-transparent'
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ tabsId, value, active, children, className }) {
  if (value !== active) return null;
  return (
    <div
      id={panelId(tabsId, value)}
      role='tabpanel'
      aria-labelledby={tabId(tabsId, value)}
      tabIndex={0}
      className={cx('focus:outline-none', className)}
    >
      {children}
    </div>
  );
}
