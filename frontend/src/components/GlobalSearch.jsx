import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineSearch, HiOutlineX, HiOutlineHome, HiOutlineUser,
  HiOutlineOfficeBuilding, HiOutlineUserGroup, HiOutlineClipboardList,
  HiOutlineClock, HiOutlineBookmark, HiOutlineLightningBolt,
  HiChevronRight, HiOutlineCheck,
} from 'react-icons/hi';
import { useSearchContext } from '../contexts/SearchContext';
import { useGlobalSearch }  from '../hooks/useGlobalSearch';
import { apiClient }        from '../utils/http';

// ─── Config ──────────────────────────────────────────────────────────────────

const ENTITY_TABS = [
  { key: 'all',      label: 'All' },
  { key: 'listings', label: 'Properties' },
  { key: 'clients',  label: 'Leads' },
  { key: 'owners',   label: 'Owners' },
  { key: 'buyers',   label: 'Buyers' },
  { key: 'tasks',    label: 'Tasks' },
];

const ENTITY_ICONS = {
  listings: HiOutlineHome,
  property: HiOutlineHome,
  clients:  HiOutlineUser,
  client:   HiOutlineUser,
  owners:   HiOutlineOfficeBuilding,
  owner:    HiOutlineOfficeBuilding,
  buyers:   HiOutlineUserGroup,
  buyer:    HiOutlineUserGroup,
  tasks:    HiOutlineClipboardList,
  task:     HiOutlineClipboardList,
  users:    HiOutlineUserGroup,
  user:     HiOutlineUserGroup,
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function EntityIcon({ entity, className = 'w-4 h-4' }) {
  const Icon = ENTITY_ICONS[entity] ?? HiOutlineSearch;
  return <Icon className={className} />;
}

function AnnotationChips({ annotations }) {
  if (!annotations?.length) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap px-4 py-2 border-b border-slate-50 bg-indigo-50/40">
      <span className="text-xs text-slate-400 mr-1">Detected:</span>
      {annotations.map((ann, i) => (
        <span
          key={i}
          className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-medium"
        >
          {ann.label}
        </span>
      ))}
    </div>
  );
}

function ResultItem({ item, entity, isActive, onMouseEnter, onClick }) {
  return (
    <button
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
        isActive ? 'bg-slate-100' : 'hover:bg-slate-50'
      }`}
    >
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
        <EntityIcon entity={entity} className="w-4 h-4 text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium text-slate-900 truncate"
          dangerouslySetInnerHTML={{ __html: item.title }}
        />
        {item.subtitle && (
          <div className="text-xs text-slate-400 truncate mt-0.5">{item.subtitle}</div>
        )}
      </div>
      {item.meta && (
        <span className="flex-shrink-0 text-xs text-slate-400 ml-2 hidden sm:block">{item.meta}</span>
      )}
      <HiChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
    </button>
  );
}

function ResultGroup({ group, startIndex, activeIndex, onHover, onSelect }) {
  return (
    <div>
      <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
        <EntityIcon entity={group.entity} className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{group.label}</span>
        <span className="text-xs text-slate-300">({group.items.length})</span>
      </div>
      {group.items.map((item, i) => (
        <ResultItem
          key={String(item._id)}
          item={item}
          entity={group.entity}
          isActive={startIndex + i === activeIndex}
          onMouseEnter={() => onHover(startIndex + i)}
          onClick={() => onSelect(item, group.entity)}
        />
      ))}
    </div>
  );
}

function EmptyState({ query, history, onHistorySelect, onHistoryRemove, onClearAll }) {
  if (query.length >= 2) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <HiOutlineSearch className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm font-medium text-slate-600">No results for "{query}"</p>
        <p className="text-xs mt-1">Try different keywords or a natural language query</p>
      </div>
    );
  }

  if (history.length) {
    return (
      <div className="p-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recent</span>
          <button
            onClick={onClearAll}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Clear all
          </button>
        </div>
        <div className="space-y-0.5">
          {history.map((h) => (
            <div key={h} className="flex items-center gap-1 group">
              <button
                onClick={() => onHistorySelect(h)}
                className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 text-left transition-colors"
              >
                <HiOutlineClock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-700">{h}</span>
              </button>
              <button
                onClick={() => onHistoryRemove(h)}
                className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-slate-100 text-slate-400 transition-all"
                aria-label="Remove from history"
              >
                <HiOutlineX className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400 px-6">
      <HiOutlineLightningBolt className="w-8 h-8 mb-3 opacity-30" />
      <p className="text-sm text-center text-slate-500 font-medium">Search across your entire CRM</p>
      <p className="text-xs text-center mt-2 text-slate-400 leading-relaxed">
        Try <span className="font-mono bg-slate-100 px-1 rounded">"3 BHK in Gurgaon under 2Cr"</span><br />
        or <span className="font-mono bg-slate-100 px-1 rounded">"Leads assigned to Amit this month"</span>
      </p>
    </div>
  );
}

function SaveSearchPrompt({ onSave, onCancel }) {
  const [name, setName] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex items-center gap-2">
      <HiOutlineBookmark className="w-4 h-4 text-slate-400 flex-shrink-0" />
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && name.trim()) { e.preventDefault(); onSave(name.trim()); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        placeholder="Name this search…"
        className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
      />
      <button
        onClick={() => name.trim() && onSave(name.trim())}
        disabled={!name.trim()}
        className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-900 text-white rounded-lg disabled:opacity-40 hover:bg-slate-700 transition-colors"
      >
        <HiOutlineCheck className="w-3 h-3" />
        Save
      </button>
      <button
        onClick={onCancel}
        className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <HiOutlineX className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function GlobalSearch() {
  const navigate   = useNavigate();
  const {
    isOpen, query, entity, history,
    close, setQuery, setEntity, addHistory, removeHistory, clearHistory,
  } = useSearchContext();

  const { results, loading } = useGlobalSearch(query, entity);
  const inputRef  = useRef(null);
  const [activeIdx,   setActiveIdx]   = useState(-1);
  const [showSave,    setShowSave]    = useState(false);
  const [savedOk,     setSavedOk]     = useState(false);

  // Focus when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 40);
      setActiveIdx(-1);
      setShowSave(false);
      setSavedOk(false);
    }
  }, [isOpen]);

  // Reset active index when results change
  useEffect(() => setActiveIdx(-1), [results]);

  // Build flat item list for keyboard navigation
  const flatItems = useMemo(
    () => (results?.groups ?? []).flatMap(g => g.items.map(item => ({ item, entity: g.entity }))),
    [results]
  );
  const totalItems = flatItems.length;

  const handleSelect = useCallback((item, ent) => {
    addHistory(query);
    apiClient.post('/search/click', { query, entity: ent, id: item._id }).catch(() => {});
    navigate(item.url);
    close();
    setQuery('');
  }, [query, addHistory, navigate, close, setQuery]);

  const handleKeyDown = useCallback((e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, totalItems - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, -1));
        break;
      case 'Enter':
        if (activeIdx >= 0 && flatItems[activeIdx]) {
          e.preventDefault();
          const { item, entity: ent } = flatItems[activeIdx];
          handleSelect(item, ent);
        } else if (query.trim().length >= 2) {
          // Full search page
          addHistory(query);
          navigate(`/search?q=${encodeURIComponent(query)}`);
          close();
        }
        break;
      case 'Escape':
        e.preventDefault();
        if (showSave) { setShowSave(false); return; }
        if (query)    { setQuery(''); return; }
        close();
        break;
      default:
        break;
    }
  }, [activeIdx, totalItems, flatItems, handleSelect, query, addHistory, navigate, close, setQuery, showSave]);

  const handleSave = useCallback(async (name) => {
    try {
      await apiClient.post('/search/saved', { name, query, entities: entity !== 'all' ? [entity] : [] });
      setSavedOk(true);
      setShowSave(false);
      setTimeout(() => setSavedOk(false), 2000);
    } catch {
      // silently ignore
    }
  }, [query, entity]);

  if (!isOpen) return null;

  // Compute group start indices for keyboard nav
  let runningIdx = 0;
  const groupsWithStart = (results?.groups ?? []).map(g => {
    const start = runningIdx;
    runningIdx += g.items.length;
    return { group: g, start };
  });

  const hasResults  = groupsWithStart.length > 0;
  const showEmpty   = !loading && !hasResults;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 sm:px-0"
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 overflow-hidden flex flex-col max-h-[72vh]">

        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          <HiOutlineSearch className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setShowSave(false); }}
            onKeyDown={handleKeyDown}
            placeholder="Search properties, leads, owners… or try '3 BHK in Gurgaon under 2Cr'"
            className="flex-1 text-sm text-slate-900 bg-transparent outline-none placeholder:text-slate-400"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {loading && (
              <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
            )}
            {savedOk && (
              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <HiOutlineCheck className="w-3.5 h-3.5" />Saved
              </span>
            )}
            {query.length >= 2 && !showSave && !savedOk && (
              <button
                onClick={() => setShowSave(true)}
                title="Save this search"
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <HiOutlineBookmark className="w-4 h-4" />
              </button>
            )}
            {query && (
              <button
                onClick={() => { setQuery(''); setShowSave(false); }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                aria-label="Clear"
              >
                <HiOutlineX className="w-4 h-4" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-xs font-medium text-slate-400 border border-slate-200 rounded bg-slate-50">
              Esc
            </kbd>
          </div>
        </div>

        {/* NLP annotation chips */}
        {results?.annotations?.length > 0 && (
          <AnnotationChips annotations={results.annotations} />
        )}

        {/* Entity tabs */}
        {(hasResults || query.length >= 2) && (
          <div className="flex items-center gap-1 px-4 pt-2 pb-2 border-b border-slate-100 overflow-x-auto scrollbar-none">
            {ENTITY_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setEntity(tab.key)}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  entity === tab.key
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {hasResults
            ? groupsWithStart.map(({ group, start }) => (
                <ResultGroup
                  key={group.entity}
                  group={group}
                  startIndex={start}
                  activeIndex={activeIdx}
                  onHover={setActiveIdx}
                  onSelect={handleSelect}
                />
              ))
            : showEmpty && (
                <EmptyState
                  query={query}
                  history={history}
                  onHistorySelect={q => { setQuery(q); }}
                  onHistoryRemove={removeHistory}
                  onClearAll={clearHistory}
                />
              )
          }
        </div>

        {/* Save search inline form */}
        {showSave && (
          <SaveSearchPrompt
            onSave={handleSave}
            onCancel={() => setShowSave(false)}
          />
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 border border-slate-200 rounded bg-white font-mono text-[10px]">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 border border-slate-200 rounded bg-white font-mono text-[10px]">↵</kbd>
              open
            </span>
            {query.length >= 2 && (
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 border border-slate-200 rounded bg-white font-mono text-[10px]">↵</kbd>
                full search
              </span>
            )}
          </div>
          {results?.responseTimeMs != null && (
            <span className="text-xs text-slate-400">{results.responseTimeMs}ms</span>
          )}
        </div>
      </div>
    </div>
  );
}
