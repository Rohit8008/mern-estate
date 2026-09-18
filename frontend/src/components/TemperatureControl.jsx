import PropTypes from 'prop-types';
import { HiFire, HiSun, HiOutlineCloud } from 'react-icons/hi';

/**
 * How warm a lead is.
 *
 * Derived from the score unless someone sets it by hand. An agent who has
 * actually spoken to the person knows better than the arithmetic, so a manual
 * choice pins the value against the nightly recalculation — which is why the
 * control shows whether the current value is derived or chosen.
 *
 * Classes are complete literal strings: Tailwind scans source as plain text, so
 * `bg-${temp}-100` would never be emitted.
 */
export const TEMPERATURES = {
  hot:  { label: 'Hot',  icon: HiFire,          chip: 'bg-rose-100 text-rose-700 ring-rose-200',    dot: 'bg-rose-500' },
  warm: { label: 'Warm', icon: HiSun,           chip: 'bg-amber-100 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  cold: { label: 'Cold', icon: HiOutlineCloud,  chip: 'bg-sky-100 text-sky-700 ring-sky-200',       dot: 'bg-sky-500' },
};

/** A read-only chip, for lists and cards. */
export function TemperatureChip({ value }) {
  const meta = TEMPERATURES[value] || TEMPERATURES.cold;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ring-1 ${meta.chip}`}>
      <Icon className='w-3 h-3' />
      {meta.label}
    </span>
  );
}

TemperatureChip.propTypes = { value: PropTypes.string };

export default function TemperatureControl({ value, manual, score, onChange, readOnly = false }) {
  if (readOnly) return <TemperatureChip value={value} />;

  return (
    <div>
      <div className='flex items-center gap-1.5'>
        {Object.entries(TEMPERATURES).map(([key, meta]) => {
          const Icon = meta.icon;
          const active = value === key;
          return (
            <button
              key={key}
              type='button'
              onClick={() => onChange(key)}
              className={
                active
                  ? `inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ring-1 ${meta.chip}`
                  : 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-500 border border-slate-200 hover:bg-slate-50 transition-colors'
              }
            >
              <Icon className='w-3.5 h-3.5' />
              {meta.label}
            </button>
          );
        })}
      </div>

      <p className='text-[11px] text-slate-400 mt-1.5'>
        {manual
          ? 'Set by hand — the nightly score will not change it.'
          : `Following the lead score (${score ?? 0}).`}
      </p>
    </div>
  );
}

TemperatureControl.propTypes = {
  value: PropTypes.string,
  manual: PropTypes.bool,
  score: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  readOnly: PropTypes.bool,
};
