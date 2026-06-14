import { HiSearch, HiX } from 'react-icons/hi';

function cx(...xs) { return xs.filter(Boolean).join(' '); }

/**
 * Standard search input used on all CRM list/board pages.
 */
export default function SearchBar({ value, onChange, placeholder = 'Search…', className }) {
  return (
    <div className={cx(
      'flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white',
      'focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-500/10 transition-all',
      className
    )}>
      <HiSearch className='w-4 h-4 text-slate-400 flex-shrink-0' />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className='flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none'
      />
      {value && (
        <button type='button' onClick={() => onChange('')} className='text-slate-400 hover:text-slate-600 transition-colors'>
          <HiX className='w-4 h-4' />
        </button>
      )}
    </div>
  );
}
