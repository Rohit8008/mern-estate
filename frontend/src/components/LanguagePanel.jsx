import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { HiGlobe, HiCheck } from 'react-icons/hi';
import { availableLanguages, setLanguage } from '../i18n/index.js';
import { useTenant } from '../contexts/TenantProvider';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';

/**
 * Choosing a language.
 *
 * Two separate settings on purpose: the workspace default (what a new colleague
 * sees on their first sign-in) and this person's own choice (what they see,
 * whatever the workspace says). Conflating them means one person switching to
 * Hindi switches it for the whole agency.
 *
 * Languages come from `availableLanguages`, which is built from the files in
 * i18n/locales — so dropping in a JSON file adds it here with no list to update.
 */
export default function LanguagePanel({ isAdmin }) {
  const { t } = useTranslation();
  const { tenant, refresh } = useTenant();
  const { showSuccess, showError } = useNotification();

  const [savingDefault, setSavingDefault] = useState(false);
  const workspaceDefault = tenant?.locale?.language || 'en';

  // What this browser is actually using right now.
  const [mine, setMine] = useState(() => {
    try {
      return localStorage.getItem('app:language') || '';
    } catch {
      return '';
    }
  });

  const chooseMine = (code) => {
    if (!code) {
      // Clearing the personal override falls back to the workspace default.
      try { localStorage.removeItem('app:language'); } catch { /* private mode */ }
      setMine('');
      setLanguage(workspaceDefault);
      return;
    }
    setMine(code);
    setLanguage(code);
  };

  const saveWorkspaceDefault = async (code) => {
    setSavingDefault(true);
    try {
      await apiClient.patch('/tenant/config', { locale: { language: code } });
      await refresh();
      showSuccess(t('settings.saved'));
    } catch {
      showError(t('settings.saveFailed'));
    }
    setSavingDefault(false);
  };

  const Option = ({ code, name, englishName, active, onSelect }) => (
    <button
      type='button'
      onClick={() => onSelect(code)}
      className={
        active
          ? 'flex items-center justify-between w-full px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50 text-left transition-colors'
          : 'flex items-center justify-between w-full px-4 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-left transition-colors'
      }
    >
      <span>
        <span className='block text-sm font-medium text-slate-900'>{name}</span>
        {englishName !== name && (
          <span className='block text-xs text-slate-500'>{englishName}</span>
        )}
      </span>
      {active && <HiCheck className='w-5 h-5 text-indigo-600 flex-shrink-0' />}
    </button>
  );

  Option.propTypes = {
    code: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    englishName: PropTypes.string.isRequired,
    active: PropTypes.bool,
    onSelect: PropTypes.func.isRequired,
  };

  return (
    <div className='space-y-4'>
      <div className='bg-white rounded-xl border border-slate-200 p-5'>
        <div className='flex items-center gap-3 mb-5'>
          <div className='w-9 h-9 rounded-xl bg-indigo-50 ring-1 ring-indigo-100 flex items-center justify-center flex-shrink-0'>
            <HiGlobe className='w-5 h-5 text-indigo-600' />
          </div>
          <div>
            <h2 className='text-base font-semibold text-slate-900'>{t('settings.language.yourLanguage')}</h2>
            <p className='text-xs text-slate-500'>{t('settings.language.yourLanguageHelp')}</p>
          </div>
        </div>

        <div className='space-y-2'>
          <Option
            code=''
            name={t('settings.language.useWorkspaceDefault')}
            englishName={t('settings.language.useWorkspaceDefault')}
            active={!mine}
            onSelect={chooseMine}
          />
          {availableLanguages.map((lang) => (
            <Option key={lang.code} {...lang} active={mine === lang.code} onSelect={chooseMine} />
          ))}
        </div>
      </div>

      {isAdmin && (
        <div className='bg-white rounded-xl border border-slate-200 p-5'>
          <div className='mb-4'>
            <h2 className='text-base font-semibold text-slate-900'>{t('settings.language.workspaceDefault')}</h2>
            <p className='text-xs text-slate-500'>{t('settings.language.description')}</p>
          </div>

          <div className='space-y-2'>
            {availableLanguages.map((lang) => (
              <Option
                key={lang.code}
                {...lang}
                active={workspaceDefault === lang.code}
                onSelect={savingDefault ? () => {} : saveWorkspaceDefault}
              />
            ))}
          </div>

          <p className='text-xs text-slate-400 mt-4'>
            Add a language by dropping a JSON file into
            {' '}<code className='text-slate-500'>{t('language.frontendSrcI18nLocales')}</code>{t('language.itAppearsHereAutomatically')}</p>
        </div>
      )}
    </div>
  );
}

LanguagePanel.propTypes = {
  isAdmin: PropTypes.bool,
};
