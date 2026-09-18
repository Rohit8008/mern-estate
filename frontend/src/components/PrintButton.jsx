import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { HiPrinter } from 'react-icons/hi';

/**
 * Print the current screen.
 *
 * Uses the browser's own print dialogue rather than generating a PDF
 * server-side: every browser can already "Save as PDF" from there, and that
 * avoids adding a headless-Chrome dependency to produce something the user can
 * make themselves in one more click.
 *
 * The page decides what prints, via the `.print-area` / `.no-print` classes in
 * index.css.
 */
export default function PrintButton({ label, className = '' }) {
  const { t } = useTranslation();

  return (
    <button
      type='button'
      onClick={() => window.print()}
      className={`no-print inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition-colors ${className}`}
    >
      <HiPrinter className='w-4 h-4' />
      {label || t('common.print', 'Print')}
    </button>
  );
}

PrintButton.propTypes = {
  label: PropTypes.string,
  className: PropTypes.string,
};
