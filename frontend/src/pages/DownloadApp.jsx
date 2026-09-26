import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HiOutlineDownload, HiOutlineDeviceMobile, HiOutlineShieldCheck } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import usePageTitle from '../hooks/usePageTitle';
import { formatDate } from '../utils/currency';

/**
 * Android app download, while the app is not on the Play Store.
 *
 * The APK and latest.json are published to /app/ by
 * mobile/scripts/publish-apk.sh, so this page never needs a rebuild for a new
 * version. latest.json is a static file, not an /api route, which is why this
 * reads it with fetch rather than apiClient.
 */

const isAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
const isIOS = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

export default function DownloadApp() {
  const { t } = useTranslation();
  usePageTitle(t('download.pageTitle'));
  const [release, setRelease] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/app/latest.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => { if (alive) setRelease(data); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const sizeMb = release ? (release.sizeBytes / (1024 * 1024)).toFixed(1) : null;
  const href = release ? `/app/${release.file}` : undefined;
  const onIOS = isIOS();
  const onAndroid = isAndroid();

  return (
    <main className='bg-[#f3f5f4] text-brand-950 min-h-[80vh]'>
      <section className='max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-20'>
        <div className='w-14 h-14 rounded-2xl bg-brand-50 ring-1 ring-brand-100 text-brand-700 flex items-center justify-center'>
          <HiOutlineDeviceMobile className='w-7 h-7' aria-hidden='true' />
        </div>
        <h1 className='mt-6 font-display font-bold text-4xl sm:text-5xl leading-[1.08] tracking-[-0.02em] text-balance'>
          {t('download.title')}
        </h1>
        <p className='mt-4 text-lg text-slate-600 leading-relaxed max-w-[52ch] text-pretty'>{t('download.body')}</p>

        <div className='mt-8 rounded-3xl bg-white ring-1 ring-brand-950/10 shadow-sm p-6 sm:p-8'>
          {failed ? (
            <p className='text-slate-600'>{t('download.unavailable')}</p>
          ) : !release ? (
            <p className='text-slate-500'>{t('download.loading')}</p>
          ) : (
            <>
              <div className='flex flex-wrap items-center gap-4 justify-between'>
                <div>
                  <p className='font-display font-bold text-xl'>{t('download.appName')}</p>
                  <p className='text-sm text-slate-500 mt-1'>
                    {t('download.meta', { version: release.version, size: sizeMb, date: formatDate(release.releasedAt) })}
                  </p>
                </div>
                {!onIOS && (
                  <a
                    href={href}
                    download
                    className='inline-flex items-center justify-center gap-2 rounded-full bg-brand-800 hover:bg-brand-900 active:scale-[0.98] text-white px-7 py-3.5 font-semibold transition-[background-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2'
                  >
                    <HiOutlineDownload className='w-5 h-5' aria-hidden='true' />
                    {t('download.button')}
                  </a>
                )}
              </div>
              {release.notes && <p className='mt-4 text-sm text-slate-600'>{release.notes}</p>}

              {onIOS && (
                <p className='mt-5 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900'>{t('download.iosNote')}</p>
              )}
              {!onAndroid && !onIOS && (
                <p className='mt-5 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700'>
                  {t('download.desktopNote')} <span className='font-semibold'>realvista.duckdns.org/download</span>
                </p>
              )}
            </>
          )}
        </div>

        {!onIOS && (
          <div className='mt-10'>
            <h2 className='font-display font-bold text-2xl'>{t('download.howTitle')}</h2>
            {/* A real sequence, so numbered. */}
            <ol className='mt-5 space-y-4'>
              {['step1', 'step2', 'step3', 'step4'].map((key, i) => (
                <li key={key} className='flex gap-4'>
                  <span className='flex-shrink-0 w-8 h-8 rounded-full bg-brand-800 text-white text-sm font-semibold flex items-center justify-center'>{i + 1}</span>
                  <p className='text-slate-700 leading-relaxed pt-1'>{t(`download.${key}`)}</p>
                </li>
              ))}
            </ol>
            <p className='mt-6 text-sm text-slate-600'>{t('download.updateNote')}</p>
          </div>
        )}

        {release && (
          <details className='mt-8 text-sm text-slate-600'>
            <summary className='cursor-pointer inline-flex items-center gap-1.5 hover:text-slate-700'>
              <HiOutlineShieldCheck className='w-4 h-4' aria-hidden='true' />
              {t('download.verifyTitle')}
            </summary>
            <p className='mt-2'>{t('download.verifyBody')}</p>
            <code className='mt-2 block break-all rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs text-slate-700'>{release.sha256}</code>
          </details>
        )}

        <p className='mt-10 text-sm text-slate-600'>
          {t('download.webNote')} <Link to='/sign-in' className='font-semibold text-brand-700 hover:underline'>{t('download.signInWeb')}</Link>
        </p>
      </section>
    </main>
  );
}
