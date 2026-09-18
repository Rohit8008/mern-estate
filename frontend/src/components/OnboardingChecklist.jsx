import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiCheckCircle, HiOutlineArrowRight, HiX } from 'react-icons/hi';
import { apiClient } from '../utils/http';

/**
 * What a new workspace still has to set up.
 *
 * Deliberately a checklist on the dashboard rather than a wizard that blocks
 * the first sign-in: someone who wants to look around first should be able to,
 * and a modal you have to dismiss to see the product is a worse first
 * impression than one that waits.
 *
 * Progress comes from the data, not from stored step flags — so inviting a
 * colleague from the admin screen ticks "invite your team" without the wizard
 * being involved, and the list never nags about work already done.
 */
export default function OnboardingChecklist() {
  const { t } = useTranslation();
  const { currentUser } = useSelector((state) => state.user);
  const [state, setState] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Only a workspace admin can act on any of these steps.
    if (currentUser?.role !== 'admin') return undefined;

    let alive = true;
    apiClient
      .get('/tenant/onboarding')
      .then((res) => { if (alive) setState(res?.data || null); })
      .catch(() => { /* a failed checklist should be invisible, not an error */ });

    return () => { alive = false; };
  }, [currentUser?.role]);

  const dismiss = async () => {
    setHidden(true);
    try {
      await apiClient.post('/tenant/onboarding/dismiss', {});
    } catch {
      // It is hidden for this session regardless; the next load will ask again.
    }
  };

  if (hidden || !state?.show) return null;

  const { steps, complete, total } = state;
  const pct = Math.round((complete / total) * 100);

  return (
    <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
      <div className='flex items-start justify-between gap-3 mb-4'>
        <div>
          <h2 className='text-base font-semibold text-slate-900'>{t('onboarding.title')}</h2>
          <p className='text-xs text-slate-500'>{t('onboarding.subtitle')}</p>
        </div>
        <button
          type='button'
          onClick={dismiss}
          className='p-1.5 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0'
          title={t('onboarding.dismiss')}
        >
          <HiX className='w-4 h-4' />
        </button>
      </div>

      <div className='flex items-center gap-3 mb-4'>
        <div className='flex-1 h-2 bg-slate-100 rounded-full overflow-hidden'>
          <div
            className='h-full bg-emerald-500 rounded-full transition-all duration-500'
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className='text-xs font-medium text-slate-500 tabular-nums flex-shrink-0'>
          {complete}/{total}
        </span>
      </div>

      <ul className='space-y-1'>
        {steps.map((step) => (
          <li key={step.id}>
            {step.done ? (
              <div className='flex items-center gap-3 px-3 py-2.5 rounded-lg'>
                <HiCheckCircle className='w-5 h-5 text-emerald-500 flex-shrink-0' />
                <span className='text-sm text-slate-400 line-through'>{step.label}</span>
              </div>
            ) : (
              <Link
                to={step.href}
                className='flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group'
              >
                <span className='w-5 h-5 rounded-full border-2 border-slate-300 flex-shrink-0' />
                <span className='flex-1 min-w-0'>
                  <span className='block text-sm font-medium text-slate-800'>{step.label}</span>
                  <span className='block text-xs text-slate-500'>{step.description}</span>
                </span>
                <HiOutlineArrowRight className='w-4 h-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0 transition-colors' />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
