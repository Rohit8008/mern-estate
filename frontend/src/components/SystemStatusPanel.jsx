import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiServer, HiCheckCircle, HiXCircle, HiRefresh } from 'react-icons/hi';
import { Button, Badge } from '../design-system';
import { apiClient } from '../utils/http';

/**
 * Deployment health, in the app.
 *
 * All of this already existed under /api/health/*, but nothing in the product
 * ever called it — so an admin could not see whether mail was configured,
 * whether scheduled jobs were running, or what version they were on. That is
 * the first thing anyone wants to know before reporting a problem.
 */
export default function SystemStatusPanel() {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    apiClient
      .get('/metrics/system')
      .then((res) => { setStatus(res?.data || null); setError(null); })
      .catch((err) => setError(err?.message || 'Could not load system status'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading && !status) return <p className='text-sm text-slate-400 p-5'>{t('common.loading')}</p>;
  if (error) return <p className='text-sm text-rose-600 p-5'>{error}</p>;
  if (!status) return null;

  const Row = ({ label, value, ok }) => (
    <div className='flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0 gap-3'>
      <span className='text-sm text-slate-500'>{label}</span>
      <span className='flex items-center gap-1.5 text-sm font-medium text-slate-900 text-right'>
        {ok === true && <HiCheckCircle className='w-4 h-4 text-emerald-500 flex-shrink-0' />}
        {ok === false && <HiXCircle className='w-4 h-4 text-slate-300 flex-shrink-0' />}
        {value}
      </span>
    </div>
  );

  const uptime = () => {
    const s = status.uptimeSeconds || 0;
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className='space-y-4'>
      <div className='bg-white rounded-xl border border-slate-200 p-5'>
        <div className='flex items-start justify-between gap-3 mb-4 flex-wrap'>
          <div className='flex items-center gap-3'>
            <div className='w-9 h-9 rounded-xl bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0'>
              <HiServer className='w-5 h-5 text-slate-600' />
            </div>
            <div>
              <h2 className='text-base font-semibold text-slate-900'>{t('system.title')}</h2>
              <p className='text-xs text-slate-500'>Version {status.version} &middot; {status.environment}</p>
            </div>
          </div>
          <Button variant='secondary' icon={HiRefresh} onClick={load} disabled={loading}>
            {t('common.refresh')}
          </Button>
        </div>

        <Row label={t('system.version')} value={status.version} />
        <Row label={t('system.environment')} value={status.environment} />
        <Row label={t('system.uptime')} value={uptime()} />
        <Row
          label={t('system.database')}
          value={`${status.database?.status || 'unknown'}${status.database?.latencyMs != null ? ` · ${status.database.latencyMs}ms` : ''}`}
          ok={status.database?.status === 'healthy'}
        />
        <Row
          label={t('system.email')}
          value={
            status.email?.source === 'workspace' ? 'This workspace’s SMTP'
              : status.email?.source === 'platform' ? 'Platform SMTP'
              : t('system.notConfigured')
          }
          ok={status.email?.source !== 'none'}
        />
        <Row
          label={t('system.runtime')}
          value={`Node ${status.runtime?.node} · ${status.runtime?.memoryMb?.heapUsed}MB heap`}
        />
      </div>

      <div className='bg-white rounded-xl border border-slate-200 p-5'>
        <h3 className='text-sm font-semibold text-slate-900 mb-3'>{t('system.scheduler')}</h3>

        {!status.scheduler?.enabled ? (
          <p className='text-sm text-slate-500'>Disabled on this instance (JOBS_ENABLED=false).</p>
        ) : !status.scheduler?.jobs?.length ? (
          <p className='text-sm text-slate-500'>{t('systemStatus.noJobsRegistered')}</p>
        ) : (
          <ul className='divide-y divide-slate-100'>
            {status.scheduler.jobs.map((job) => (
              <li key={job.name} className='flex items-start justify-between gap-3 py-2.5'>
                <div className='min-w-0'>
                  <p className='text-sm font-medium text-slate-800'>{job.name}</p>
                  <p className='text-xs text-slate-400'>{job.schedule}</p>
                  {job.lastResult && (
                    <p className='text-xs text-slate-500 mt-0.5 truncate'>{job.lastResult}</p>
                  )}
                </div>
                <div className='text-right flex-shrink-0'>
                  <Badge variant={job.healthy ? 'success' : 'error'}>
                    {job.healthy ? t('system.healthy') : t('system.failing')}
                  </Badge>
                  <p className='text-xs text-slate-400 mt-1'>
                    {job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : t('system.never')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className='bg-white rounded-xl border border-slate-200 p-5'>
        <h3 className='text-sm font-semibold text-slate-900 mb-3'>{t('system.integrations')}</h3>
        {Object.entries(status.integrations || {}).map(([key, on]) => (
          <Row
            key={key}
            label={key}
            value={on ? t('system.configured') : t('system.notConfigured')}
            ok={Boolean(on)}
          />
        ))}
      </div>
    </div>
  );
}
