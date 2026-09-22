import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The landing page's one moving part: an example lead walking the stages of an
 * Indian property deal, enquiry to registry, with the activity the CRM records
 * at each step.
 *
 * Every event is something the product does (portal lead import, site-visit
 * tasks, expiring WhatsApp share links, typed RERA documents, transactions with
 * commission), and the lead is labelled as an example, so this illustrates the
 * product rather than claiming a customer.
 *
 * It plays once on load, then the stages are buttons: clicking one shows the
 * deal at that point. Reduced motion shows the finished deal without playing.
 */

const STAGES = ['enquiry', 'visit', 'negotiation', 'token', 'registry'];
const STEP_MS = 1500;
const START_DELAY_MS = 900;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function DealJourney() {
  const { t } = useTranslation();
  const last = STAGES.length - 1;
  const [stage, setStage] = useState(() => (prefersReducedMotion() ? last : 0));
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const timer = useRef(null);

  useEffect(() => {
    if (!playing) return undefined;
    if (stage >= last) {
      setPlaying(false);
      return undefined;
    }
    timer.current = setTimeout(() => setStage((s) => s + 1), stage === 0 ? START_DELAY_MS + STEP_MS : STEP_MS);
    return () => clearTimeout(timer.current);
  }, [playing, stage, last]);

  const jumpTo = (i) => {
    setPlaying(false);
    setStage(i);
  };

  const replay = () => {
    if (prefersReducedMotion()) { setStage(last); return; }
    setStage(0);
    setPlaying(true);
  };

  // Newest first, like the activity feed on a client record.
  const events = STAGES.slice(0, stage + 1).map((key, i) => ({ key, i })).reverse();
  const progress = (stage / last) * 100;

  return (
    <div className='relative rounded-[28px] bg-white ring-1 ring-brand-950/10 shadow-[0_40px_80px_-40px_rgba(8,31,50,0.45)] p-5 sm:p-7'>
      {/* Lead */}
      <div className='flex items-start gap-4'>
        <div
          className='w-12 h-12 rounded-2xl bg-marigold-100 text-marigold-700 font-display font-bold text-lg flex items-center justify-center flex-shrink-0'
          aria-hidden='true'
        >
          HK
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
            <p className='font-display text-lg font-bold text-brand-950 leading-tight'>{t('landing.journey.leadName')}</p>
            <span className='text-xs text-slate-500 border border-slate-200 rounded-full px-2 py-0.5'>
              {t('landing.journey.exampleLabel')}
            </span>
          </div>
          <p className='text-sm text-slate-600 mt-1'>{t('landing.journey.leadNeed')}</p>
          <p className='text-sm text-slate-600'>{t('landing.journey.leadBudget')}</p>
        </div>
      </div>

      {/* Stage rail */}
      <div className='mt-7'>
        <div className='relative h-1.5 rounded-full bg-slate-100 mx-[10%]' aria-hidden='true'>
          <div
            className='absolute inset-y-0 left-0 rounded-full bg-marigold-400 transition-[width] duration-700 ease-out motion-reduce:transition-none'
            style={{ width: `${progress}%` }}
          />
        </div>
        <ol className='relative grid grid-cols-5 -mt-[15px]'>
          {STAGES.map((key, i) => {
            const done = i < stage;
            const current = i === stage;
            return (
              <li key={key} className='flex justify-center'>
                <button
                  type='button'
                  onClick={() => jumpTo(i)}
                  aria-current={current ? 'step' : undefined}
                  aria-label={t('landing.journey.showStage', { stage: t(`landing.journey.stages.${key}`) })}
                  className='group flex flex-col items-center gap-2 rounded-xl px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
                >
                  <span
                    className={
                      current
                        ? 'w-6 h-6 rounded-full bg-marigold-400 ring-4 ring-marigold-100 transition-colors duration-300'
                        : done
                          ? 'w-6 h-6 rounded-full bg-brand-700 ring-4 ring-white transition-colors duration-300'
                          : 'w-6 h-6 rounded-full bg-white ring-2 ring-inset ring-slate-300 group-hover:ring-brand-400 transition-colors duration-300'
                    }
                  />
                  <span
                    className={
                      current
                        ? 'text-[0.72rem] sm:text-xs font-semibold text-brand-950 text-center leading-tight'
                        : 'text-[0.72rem] sm:text-xs text-slate-500 group-hover:text-brand-800 text-center leading-tight'
                    }
                  >
                    {t(`landing.journey.stages.${key}`)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Activity */}
      <ol className='mt-6 space-y-1.5 min-h-[27rem] sm:min-h-[26rem]' aria-live='polite'>
        {events.map(({ key, i }) => (
          <li
            key={key}
            className={
              i === stage
                ? 'journey-event flex gap-3 rounded-2xl bg-marigold-100/60 px-4 py-3'
                : 'journey-event flex gap-3 rounded-2xl px-4 py-3'
            }
          >
            <span
              className={i === stage ? 'mt-1.5 w-2 h-2 rounded-full bg-marigold-500 flex-shrink-0' : 'mt-1.5 w-2 h-2 rounded-full bg-brand-700 flex-shrink-0'}
              aria-hidden='true'
            />
            <div className='min-w-0'>
              <p className='text-sm text-brand-950 leading-snug'>{t(`landing.journey.events.${key}`)}</p>
              <p className='text-xs text-slate-500 mt-0.5'>{t(`landing.journey.times.${key}`)}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className='mt-4 flex justify-end'>
        <button
          type='button'
          onClick={replay}
          disabled={playing}
          className='text-sm font-medium text-brand-700 hover:text-brand-900 disabled:text-slate-400 rounded-lg px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
        >
          {t('landing.journey.replay')}
        </button>
      </div>
    </div>
  );
}
