import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineSearch, HiOutlineHome, HiOutlineUser, HiOutlineOfficeBuilding,
  HiOutlineUserGroup, HiOutlineClipboardList, HiChevronRight,
} from 'react-icons/hi';
import { useGlobalSearch } from '../hooks/useGlobalSearch';
import { apiClient } from '../utils/http';
import { useTranslation } from 'react-i18next';

const RESULTS_PER_ENTITY = 15;

const ENTITY_ICONS = {
  listings: HiOutlineHome,
  clients:  HiOutlineUser,
  owners:   HiOutlineOfficeBuilding,
  buyers:   HiOutlineUserGroup,
  tasks:    HiOutlineClipboardList,
  users:    HiOutlineUserGroup,
};

function EntityIcon({ entity, className = 'w-4 h-4' }) {
  const Icon = ENTITY_ICONS[entity] ?? HiOutlineSearch;
  return <Icon className={className} />;
}

function ResultCard({ item, entity, onClick }) {
  return (
    <button
      onClick={onClick}
      className='w-full flex items-center gap-3 px-4 py-3 text-left bg-white border border-slate-200 rounded-xl hover:border-slate-300 hover:shadow-sm transition-all'
    >
      <div className='w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0'>
        <EntityIcon entity={entity} className='w-4 h-4 text-slate-500' />
      </div>
      <div className='flex-1 min-w-0'>
        <div className='text-sm font-medium text-slate-900 truncate'>{item.title}</div>
        {item.subtitle && (
          <div className='text-xs text-slate-400 truncate mt-0.5'>{item.subtitle}</div>
        )}
      </div>
      {item.meta && (
        <span className='flex-shrink-0 text-xs text-slate-400 hidden sm:block'>{item.meta}</span>
      )}
      <HiChevronRight className='w-4 h-4 text-slate-300 flex-shrink-0' />
    </button>
  );
}

function ResultGroup({ group, onSelect }) {
  return (
    <div>
      <div className='flex items-center gap-2 mb-2'>
        <EntityIcon entity={group.entity} className='w-4 h-4 text-slate-400' />
        <h3 className='text-sm font-semibold text-slate-700'>{group.label}</h3>
        <span className='text-xs text-slate-400'>({group.items.length})</span>
      </div>
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
        {group.items.map((item) => (
          <ResultCard key={String(item._id)} item={item} entity={group.entity} onClick={() => onSelect(item)} />
        ))}
      </div>
    </div>
  );
}

// Full, inline (non-modal) CRM-wide search results — listings, clients, owners,
// buyer requirements, and tasks — for embedding directly on the dashboard page.
export default function DashboardCrmSearch({ query }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { results, loading } = useGlobalSearch(query, 'all', RESULTS_PER_ENTITY);

  const groups = useMemo(() => results?.groups ?? [], [results]);
  const hasResults = groups.length > 0;
  const showEmpty = !loading && !hasResults;

  const handleSelect = (item) => {
    apiClient.post('/search/click', { query, id: item._id }).catch(() => {});
    navigate(item.url);
  };

  const totalResults = useMemo(() => groups.reduce((sum, g) => sum + g.items.length, 0), [groups]);

  return (
    <div className='space-y-5'>
      <div className='flex items-center justify-between'>
        <h2 className='text-base font-semibold text-slate-900'>
          Search results for &ldquo;{query}&rdquo;
        </h2>
        {results && (
          <span className='text-xs text-slate-400'>
            {totalResults} result{totalResults === 1 ? '' : 's'} &middot; {results.responseTimeMs}ms
          </span>
        )}
      </div>

      {results?.annotations?.length > 0 && (
        <div className='flex items-center gap-1.5 flex-wrap'>
          <span className='text-xs text-slate-400'>{t('dashboardCrmSearch.detected')}</span>
          {results.annotations.map((ann, i) => (
            <span
              key={i}
              className='inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium'
            >
              {ann.label}
            </span>
          ))}
        </div>
      )}

      {loading && (
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className='h-14 bg-slate-100 rounded-xl animate-pulse' />
          ))}
        </div>
      )}

      {!loading && hasResults && (
        <div className='space-y-6'>
          {groups.map((group) => (
            <ResultGroup key={group.entity} group={group} onSelect={handleSelect} />
          ))}
        </div>
      )}

      {showEmpty && (
        <div className='flex flex-col items-center justify-center py-16 text-slate-400'>
          <HiOutlineSearch className='w-10 h-10 mb-3 opacity-30' />
          <p className='text-sm font-medium text-slate-600'>No results for &ldquo;{query}&rdquo;</p>
          <p className='text-xs mt-1'>{t('dashboardCrmSearch.tryDifferentKeywordsOrANatural')}</p>
        </div>
      )}
    </div>
  );
}
