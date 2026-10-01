import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Modal } from '../design-system';
import { useSearchContext } from '../contexts/SearchContext';
import { useCommands, SHOW_SHORTCUTS_EVENT, TOGGLE_SIDEBAR_EVENT } from './commands';

/** How long the second key of a sequence ("g" then "d") is waited for. */
const SEQUENCE_MS = 900;

/**
 * Nothing fires while someone is typing. Checked on the event target rather
 * than document.activeElement so a shortcut pressed in a portalled input (a
 * modal's field) is still recognised as typing.
 */
function isTyping(target) {
  if (!target || !(target instanceof Element)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"]'));
}

function Kbd({ children }) {
  return (
    <kbd className='inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-md border border-border bg-secondary text-[11px] font-semibold text-foreground/80 font-mono'>
      {children}
    </kbd>
  );
}

function ShortcutKeys({ combo }) {
  const { t } = useTranslation();
  const keys = combo.split(' ');
  return (
    <span className='flex items-center gap-1'>
      {keys.map((k, i) => (
        <span key={`${k}-${i}`} className='flex items-center gap-1'>
          {i > 0 && <span className='text-xs text-muted-foreground'>{t('shortcuts.then')}</span>}
          <Kbd>{k}</Kbd>
        </span>
      ))}
    </span>
  );
}

/**
 * Keyboard shortcuts for the CRM: "g" sequences to move between screens, "n"
 * sequences to create, "/" for search, "[" for the sidebar, "?" for this list.
 *
 * Bound from the same command list as the ⌘K palette (useCommands), so the
 * two always agree on what this user may reach. Plain keys only — anything
 * with Ctrl, Cmd or Alt is left to the browser and to ⌘K.
 */
export default function KeyboardShortcuts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isOpen: searchOpen, open: openSearch } = useSearchContext();
  const { create, navigate: goTo, general } = useCommands();
  const [helpOpen, setHelpOpen] = useState(false);
  const pending = useRef({ key: null, at: 0 });

  const bySequence = useMemo(() => {
    const map = new Map();
    [...create, ...goTo, ...general].forEach((c) => {
      if (c.shortcut && c.shortcut.includes(' ')) map.set(c.shortcut, c);
    });
    return map;
  }, [create, goTo, general]);

  useEffect(() => {
    const onShow = () => setHelpOpen(true);
    window.addEventListener(SHOW_SHORTCUTS_EVENT, onShow);
    return () => window.removeEventListener(SHOW_SHORTCUTS_EVENT, onShow);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (searchOpen || helpOpen || isTyping(e.target)) return;
      // Another dialog is open — its keys are its own.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const now = Date.now();

      if (pending.current.key && now - pending.current.at < SEQUENCE_MS) {
        const command = bySequence.get(`${pending.current.key} ${key}`);
        pending.current = { key: null, at: 0 };
        if (command) {
          e.preventDefault();
          if (command.to) navigate(command.to); else command.run?.();
        }
        return;
      }

      if (key === 'g' || key === 'n') {
        pending.current = { key, at: now };
        return;
      }
      if (e.key === '/') { e.preventDefault(); openSearch(); return; }
      if (e.key === '?') { e.preventDefault(); setHelpOpen(true); return; }
      if (e.key === '[') { e.preventDefault(); window.dispatchEvent(new Event(TOGGLE_SIDEBAR_EVENT)); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bySequence, navigate, openSearch, searchOpen, helpOpen]);

  const groups = [
    {
      title: t('shortcuts.general'),
      rows: [
        { label: t('shortcuts.openSearch'), combo: '⌘ K' },
        { label: t('shortcuts.openSearch'), combo: '/' },
        { label: t('shortcuts.toggleSidebar'), combo: '[' },
        { label: t('commands.keyboardShortcuts'), combo: '?' },
      ],
    },
    { title: t('shortcuts.create'), rows: create.filter((c) => c.shortcut).map((c) => ({ label: c.label, combo: c.shortcut })) },
    { title: t('shortcuts.goTo'), rows: goTo.filter((c) => c.shortcut).map((c) => ({ label: c.label, combo: c.shortcut })) },
  ].filter((g) => g.rows.length > 0);

  return (
    <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t('commands.keyboardShortcuts')} size='lg'>
      <div className='grid gap-6 sm:grid-cols-2'>
        {groups.map((group) => (
          <section key={group.title}>
            <h3 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2'>{group.title}</h3>
            <ul className='space-y-1.5'>
              {group.rows.map((row, i) => (
                <li key={`${row.combo}-${i}`} className='flex items-center justify-between gap-4 text-sm'>
                  {/* ⌘K is two keys pressed together, not a sequence. */}
                  <span className='text-foreground/80 truncate'>{row.label}</span>
                  {row.combo === '⌘ K' ? <span className='flex gap-1'><Kbd>⌘</Kbd><Kbd>K</Kbd></span> : <ShortcutKeys combo={row.combo} />}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
