import { HiSearch, HiX } from 'react-icons/hi';

function cx(...xs) { return xs.filter(Boolean).join(' '); }

/**
 * Standard search input used on all CRM list/board pages.
 */
export default function SearchBar({ value, onChange, placeholder = 'Search…', label, className }) {
  return (
    <div className={cx(
      'flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white',
      'focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-500 transition-all',
      className
    )}>
      <HiSearch className='w-4 h-4 text-slate-500 flex-shrink-0' aria-hidden='true' />
      {/* A placeholder disappears as soon as someone types and is not read
          as a name by every screen reader; the label is. */}
      <input
        type='search'
        aria-label={label || placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className='flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-500 outline-none'
      />
      {value && (
        <button type='button' onClick={() => onChange('')} aria-label='Clear search' className='text-slate-500 hover:text-slate-700 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'>
          <HiX className='w-4 h-4' aria-hidden='true' />
        </button>
      )}
    </div>
  );
}
