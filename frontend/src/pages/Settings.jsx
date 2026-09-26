import { useState, useEffect, useId } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useSearchParams } from 'react-router-dom';
import { signOutUserSuccess } from '../redux/user/userSlice';
import { apiClient, setUserSignedOut } from '../utils/http';
import { invalidateNotificationPreferences } from '../hooks/useNotificationPreferences';
import { DEFAULT_AVATAR_URL } from '../utils/avatarPlaceholder';
import { useNotification } from '../contexts/NotificationContext';
import { useAppearance } from '../contexts/useAppearance';
import WorkspaceScreensPanel from '../components/WorkspaceScreensPanel';
import WorkspaceBrandingPanel from '../components/WorkspaceBrandingPanel';
import WorkspacePipelinePanel from '../components/WorkspacePipelinePanel';
import WorkspaceMailPanel from '../components/WorkspaceMailPanel';
import EmailTemplatesPanel from '../components/EmailTemplatesPanel';
import WebhooksPanel from '../components/WebhooksPanel';
import LeadSourcesPanel from '../components/LeadSourcesPanel';
import SystemStatusPanel from '../components/SystemStatusPanel';
import LanguagePanel from '../components/LanguagePanel';
import SequencesPanel from '../components/SequencesPanel';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import {
  HiBell,
  HiShieldCheck,
  HiEye,
  HiUser,
  HiLockClosed,
  HiLogout,
  HiChevronRight,
  HiCheck,
  HiExclamation,
  HiDeviceMobile,
  HiGlobe,
  HiColorSwatch,
  HiViewGrid,
  HiOfficeBuilding,
  HiViewBoards,
  HiTag,
  HiTemplate,
  HiLink,
  HiServer,
  HiMail,
  HiLightningBolt,
} from 'react-icons/hi';
import { HiOutlineSun, HiOutlineMoon, HiOutlineComputerDesktop } from 'react-icons/hi2';

export default function Settings() {
  const { currentUser } = useSelector((state) => state.user);
  const dispatch = useDispatch();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation();
  const { themePreference, setTheme, compactMode, setCompactMode } = useAppearance();

  /**
   * Preferences live on the account, not in this browser.
   *
   * They used to be written to localStorage behind a fake 500ms delay, so
   * "saved" meant "saved on this device" and the server — which is what
   * actually decides whether to send you an email — never saw them.
   *
   * `catalogue` comes from the server too, so a new notification type appears
   * here without a second hard-coded list to keep in step.
   */
  const [catalogue, setCatalogue] = useState({});
  const [notificationPrefs, setNotificationPrefs] = useState({});
  const [privacy, setPrivacy] = useState({
    showEmail: false,
    showPhone: false,
    showOnlineStatus: true,
    allowMessages: true,
  });
  const [loadingPrefs, setLoadingPrefs] = useState(true);

  // ?section=<id> opens a tab directly, so a link can land on the tab it
  // means (the onboarding checklist's "Set up your agency" → branding).
  const [searchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState(searchParams.get('section') || 'notifications');
  const [saving, setSaving] = useState(false);
  const [pendingSignOutAll, setPendingSignOutAll] = useState(false);

  useEffect(() => {
    if (!currentUser?._id) return;

    let cancelled = false;
    setLoadingPrefs(true);

    apiClient
      .get('/notifications/preferences')
      .then((res) => {
        if (cancelled) return;
        const data = res?.data || {};
        setCatalogue(data.catalogue || {});
        setNotificationPrefs(data.notifications || {});
        if (data.privacy) setPrivacy(data.privacy);
      })
      .catch(() => {
        if (!cancelled) showError('Could not load your preferences');
      })
      .finally(() => {
        if (!cancelled) setLoadingPrefs(false);
      });

    return () => { cancelled = true; };
  }, [currentUser?._id, showError]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await apiClient.patch('/notifications/preferences', {
        notifications: notificationPrefs,
        privacy,
      });
      // Other open screens (the push listener, the bell) re-read on this.
      invalidateNotificationPreferences();
      showSuccess('Settings saved');
    } catch (error) {
      showError('Failed to save settings');
    }
    setSaving(false);
  };

  /** Flip one channel of one notification type. Saved by the Save button. */
  const toggleNotification = (type, channel) => {
    setNotificationPrefs((prev) => {
      const current = prev[type] || { inApp: true, email: false };
      return { ...prev, [type]: { ...current, [channel]: !current[channel] } };
    });
  };

  const togglePrivacy = (key) => setPrivacy((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleCompactModeToggle = () => setCompactMode(!compactMode);

  const handleSignOutAllDevices = async () => {
    setUserSignedOut(true);
    try {
      await apiClient.post('/auth/signout-all', {}).catch(() => {});
      dispatch(signOutUserSuccess());
      localStorage.removeItem('persist:root');
      sessionStorage.clear();
      showSuccess('Signed out from all devices');
      window.location.href = '/sign-in';
    } catch (error) {
      showError('Failed to sign out from all devices');
    }
  };

  const menuItems = [
    { id: 'notifications', label: 'Notifications', icon: HiBell, description: 'Manage how you receive notifications' },
    { id: 'privacy', label: 'Privacy', icon: HiEye, description: 'Control your privacy settings' },
    { id: 'security', label: 'Security', icon: HiShieldCheck, description: 'Protect your account' },
    { id: 'appearance', label: 'Appearance', icon: HiColorSwatch, description: 'Customize your experience' },
    { id: 'language', label: t('settings.tabs.language'), icon: HiGlobe, description: t('settings.language.description') },
    // Workspace-wide rather than personal, so only an admin sees it — everyone
    // else's settings here affect only their own account.
    ...(currentUser?.role === 'admin'
      ? [
          { id: 'branding', label: 'Workspace', icon: HiOfficeBuilding, description: 'Your name, logo, colours and units' },
          { id: 'workspace', label: 'Menu & screens', icon: HiViewGrid, description: 'Choose which screens your team uses' },
          { id: 'pipeline', label: 'Sales pipeline', icon: HiViewBoards, description: 'The stages your deals move through' },
          { id: 'leadSources', label: 'Lead sources', icon: HiTag, description: 'Your channels, and what each costs per month' },
          { id: 'sequences', label: 'Follow-up sequences', icon: HiLightningBolt, description: 'Multi-step follow-ups that run on their own' },
          { id: 'email', label: 'Email', icon: HiMail, description: 'Send mail from your own address' },
          { id: 'templates', label: 'Email templates', icon: HiTemplate, description: 'Your wording for what the CRM sends' },
          { id: 'webhooks', label: 'Webhooks', icon: HiLink, description: 'Forward events to another system' },
          { id: 'system', label: 'System', icon: HiServer, description: 'Version, database, scheduled jobs' },
        ]
      : []),
  ];

  function ToggleSwitch({ enabled, onToggle, label, description }) {
    const id = useId();
    return (
      <div className='flex items-center justify-between py-4 border-b border-slate-100 last:border-0'>
        <div className='flex-1 pr-4'>
          <div id={`${id}-label`} className='text-sm font-medium text-slate-900'>{label}</div>
          {description && <div id={`${id}-desc`} className='text-xs text-slate-500 mt-0.5'>{description}</div>}
        </div>
        <button
          type='button'
          role='switch'
          aria-checked={enabled}
          aria-labelledby={`${id}-label`}
          aria-describedby={description ? `${id}-desc` : undefined}
          onClick={onToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 flex-shrink-0 ${
            enabled ? 'bg-indigo-600' : 'bg-slate-200'
          }`}
        >
          <span
            aria-hidden='true'
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    );
  }

  ToggleSwitch.propTypes = {
    enabled: PropTypes.bool.isRequired,
    onToggle: PropTypes.func.isRequired,
    label: PropTypes.string.isRequired,
    description: PropTypes.string,
  };

  /**
   * A compact tick for the notification matrix, where a full toggle per cell
   * would make the table unreadable. `label` is for screen readers only — the
   * visible meaning comes from the row and column headings.
   */
  function Checkbox({ checked, onChange, label }) {
    return (
      <button
        type='button'
        role='checkbox'
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors mx-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 ${
          checked
            ? 'bg-indigo-600 border-indigo-600 text-white'
            : 'bg-white border-slate-300 hover:border-slate-400'
        }`}
      >
        {checked && <HiCheck className='w-3.5 h-3.5' aria-hidden='true' />}
      </button>
    );
  }

  Checkbox.propTypes = {
    checked: PropTypes.bool.isRequired,
    onChange: PropTypes.func.isRequired,
    label: PropTypes.string.isRequired,
  };

  return (
    <div className='space-y-6'>
      {/* Page header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
        <div>
          <h1 className='text-xl font-bold text-slate-900'>{t('settings.settings')}</h1>
          <p className='text-sm text-slate-500 mt-0.5'>{t('settings.manageYourAccountPreferences')}</p>
        </div>
        <div className='flex items-center gap-2'>
          <Link
            to='/profile'
            className='inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors'
          >
            <HiUser className='w-4 h-4' aria-hidden='true' />{t('settings.profile')}</Link>
          {/* This saves notification and privacy preferences only. On the
              workspace tabs it sat next to the panel's own save and did nothing
              for what had just been edited, so it shows only where it applies. */}
          {(activeSection === 'notifications' || activeSection === 'privacy') && (
            <button
              onClick={saveSettings}
              disabled={saving}
              className='inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 text-sm font-semibold transition-colors'
            >
              {saving ? (
                <>
                  <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' aria-hidden='true' />{t('settings.saving')}</>
              ) : (
                <>
                  <HiCheck className='w-4 h-4' aria-hidden='true' />{t('settings.saveChanges')}</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main grid */}
      <div className='grid grid-cols-1 lg:grid-cols-4 gap-6'>
        {/* Sidebar navigation */}
        <div className='lg:col-span-1 space-y-4'>
          <nav className='bg-white rounded-xl border border-slate-200 overflow-hidden' aria-label='Settings sections'>
            {menuItems.map((item) => (
              <button
                key={item.id}
                type='button'
                aria-current={activeSection === item.id ? 'page' : undefined}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors border-b border-slate-100 last:border-0 ${
                  activeSection === item.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  activeSection === item.id ? 'bg-indigo-100' : 'bg-slate-100'
                }`}>
                  <item.icon className={`w-4 h-4 ${activeSection === item.id ? 'text-indigo-600' : 'text-slate-500'}`} aria-hidden='true' />
                </div>
                <div className='flex-1 min-w-0'>
                  <div className='text-sm font-medium'>{item.label}</div>
                  <div className='text-xs text-slate-500 mt-0.5 truncate hidden sm:block'>{item.description}</div>
                </div>
                <HiChevronRight className={`w-4 h-4 flex-shrink-0 ${activeSection === item.id ? 'text-indigo-400' : 'text-slate-300'}`} aria-hidden='true' />
              </button>
            ))}
          </nav>

          {/* Account info card */}
          <div className='bg-white rounded-xl border border-slate-200 p-4'>
            <div className='flex items-center gap-3'>
              <img
                src={currentUser?.avatar || DEFAULT_AVATAR_URL}
                alt=''
                className='w-10 h-10 rounded-full object-cover ring-2 ring-slate-100'
              />
              <div className='flex-1 min-w-0'>
                <div className='text-sm font-semibold text-slate-900 truncate'>{currentUser?.username}</div>
                <div className='text-xs text-slate-500 truncate'>{currentUser?.email}</div>
              </div>
            </div>
            <div className='mt-3 pt-3 border-t border-slate-100'>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                currentUser?.role === 'admin' ? 'bg-rose-100 text-rose-700' :
                currentUser?.role === 'employee' ? 'bg-indigo-100 text-indigo-700' :
                'bg-emerald-100 text-emerald-700'
              }`}>
                {currentUser?.role === 'admin' ? 'Admin' : currentUser?.role === 'employee' ? 'Employee' : 'User'}
              </span>
            </div>
          </div>
        </div>

        {/* Settings content */}
        <div className='lg:col-span-3'>

          {/* Notifications */}
          {activeSection === 'notifications' && (
            <div className='space-y-4'>
              <div className='bg-white rounded-xl border border-slate-200 p-5'>
                <div className='flex items-center gap-3 mb-5'>
                  <div className='w-9 h-9 rounded-xl bg-indigo-50 ring-1 ring-indigo-100 flex items-center justify-center flex-shrink-0'>
                    <HiBell className='w-5 h-5 text-indigo-600' aria-hidden='true' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-slate-900'>{t('settings.notifications.heading')}</h2>
                    <p className='text-xs text-slate-500'>{t('settings.chooseWhatReachesYouInThe')}</p>
                  </div>
                </div>

                {loadingPrefs ? (
                  <p className='text-sm text-slate-500 py-4'>Loading your preferences&hellip;</p>
                ) : Object.keys(catalogue).length === 0 ? (
                  <p className='text-sm text-slate-500 py-4'>{t('settings.noNotificationTypesAvailable')}</p>
                ) : (
                  <div className='overflow-x-auto -mx-5 px-5'>
                    <table className='w-full min-w-[26rem]'>
                      <thead>
                        <tr className='border-b border-slate-100'>
                          <th className='text-left text-xs font-medium text-slate-500 uppercase tracking-wide pb-2'>{t('settings.event')}</th>
                          <th className='text-center text-xs font-medium text-slate-500 uppercase tracking-wide pb-2 w-20'>{t('settings.inApp')}</th>
                          <th className='text-center text-xs font-medium text-slate-500 uppercase tracking-wide pb-2 w-20'>{t('settings.email')}</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-slate-50'>
                        {Object.entries(catalogue).map(([type, meta]) => {
                          const pref = notificationPrefs[type] || { inApp: true, email: false };
                          return (
                            <tr key={type}>
                              <td className='py-3 pr-4'>
                                {/*
                                  * The catalogue comes from the server, which
                                  * stays the single source of WHICH types
                                  * exist. The wording is translated by the
                                  * type's stable id, falling back to the
                                  * server's English when a locale has no
                                  * entry — so a new type shows up immediately
                                  * rather than waiting on a translation.
                                  */}
                                <div className='text-sm font-medium text-slate-800'>
                                  {t(`settings.notificationTypes.${type}.label`, meta.label)}
                                </div>
                                <div className='text-xs text-slate-500'>
                                  {t(`settings.notificationTypes.${type}.description`, meta.description)}
                                </div>
                              </td>
                              <td className='py-3 text-center'>
                                <Checkbox
                                  checked={pref.inApp !== false}
                                  onChange={() => toggleNotification(type, 'inApp')}
                                  label={`${t(`settings.notificationTypes.${type}.label`, meta.label)} in app`}
                                />
                              </td>
                              <td className='py-3 text-center'>
                                <Checkbox
                                  checked={pref.email === true}
                                  onChange={() => toggleNotification(type, 'email')}
                                  label={`${t(`settings.notificationTypes.${type}.label`, meta.label)} by email`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Privacy */}
          {activeSection === 'privacy' && (
            <div className='space-y-4'>
              <div className='bg-white rounded-xl border border-slate-200 p-5'>
                <div className='flex items-center gap-3 mb-5'>
                  <div className='w-9 h-9 rounded-xl bg-emerald-50 ring-1 ring-emerald-100 flex items-center justify-center flex-shrink-0'>
                    <HiEye className='w-5 h-5 text-emerald-600' aria-hidden='true' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-slate-900'>{t('settings.profileVisibility')}</h2>
                    <p className='text-xs text-slate-500'>{t('settings.controlWhatOthersCanSee')}</p>
                  </div>
                </div>
                <div>
                  <ToggleSwitch
                    enabled={privacy.showEmail}
                    onToggle={() => togglePrivacy('showEmail')}
                    label={t('settings.showEmailAddress')}
                    description={t('settings.allowOtherUsersToSeeYour')}
                  />
                  <ToggleSwitch
                    enabled={privacy.showPhone}
                    onToggle={() => togglePrivacy('showPhone')}
                    label={t('settings.showPhoneNumber')}
                    description={t('settings.displayYourPhoneNumberOnYour')}
                  />
                  <ToggleSwitch
                    enabled={privacy.showOnlineStatus}
                    onToggle={() => togglePrivacy('showOnlineStatus')}
                    label={t('settings.showOnlineStatus')}
                    description={t('settings.letOthersSeeWhenYouAre')}
                  />
                </div>
              </div>

              <div className='bg-white rounded-xl border border-slate-200 p-5'>
                <div className='flex items-center gap-3 mb-5'>
                  <div className='w-9 h-9 rounded-xl bg-indigo-50 ring-1 ring-indigo-100 flex items-center justify-center flex-shrink-0'>
                    <HiGlobe className='w-5 h-5 text-indigo-600' aria-hidden='true' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-slate-900'>{t('settings.communication')}</h2>
                    <p className='text-xs text-slate-500'>{t('settings.manageWhoCanContactYou')}</p>
                  </div>
                </div>
                <div>
                  <ToggleSwitch
                    enabled={privacy.allowMessages}
                    onToggle={() => togglePrivacy('allowMessages')}
                    label={t('settings.allowDirectMessages')}
                    description={t('settings.letOtherUsersSendYouMessages')}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Security */}
          {activeSection === 'security' && (
            <div className='space-y-4'>
              <div className='bg-white rounded-xl border border-slate-200 p-5'>
                <div className='flex items-center gap-3 mb-5'>
                  <div className='w-9 h-9 rounded-xl bg-rose-50 ring-1 ring-rose-100 flex items-center justify-center flex-shrink-0'>
                    <HiLockClosed className='w-5 h-5 text-rose-600' aria-hidden='true' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-slate-900'>{t('settings.passwordAuthentication')}</h2>
                    <p className='text-xs text-slate-500'>{t('settings.manageYourAccountSecurity')}</p>
                  </div>
                </div>
                <Link
                  to='/password-reset'
                  className='flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors group'
                >
                  <div className='flex items-center gap-3'>
                    <div className='w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center'>
                      <HiLockClosed className='w-4 h-4 text-slate-500' aria-hidden='true' />
                    </div>
                    <div>
                      <div className='text-sm font-medium text-slate-900'>{t('settings.changePassword')}</div>
                      <div className='text-xs text-slate-500'>{t('settings.updateYourPasswordRegularlyForSecurity')}</div>
                    </div>
                  </div>
                  <HiChevronRight className='w-4 h-4 text-slate-400 group-hover:text-slate-600' aria-hidden='true' />
                </Link>
              </div>

              <div className='bg-white rounded-xl border border-slate-200 p-5'>
                <div className='flex items-center gap-3 mb-5'>
                  <div className='w-9 h-9 rounded-xl bg-amber-50 ring-1 ring-amber-100 flex items-center justify-center flex-shrink-0'>
                    <HiDeviceMobile className='w-5 h-5 text-amber-600' aria-hidden='true' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-slate-900'>{t('settings.activeSessions')}</h2>
                    <p className='text-xs text-slate-500'>Manage devices where you&apos;re logged in</p>
                  </div>
                </div>
                <div className='space-y-3'>
                  <div className='flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-xl'>
                    <div className='flex items-center gap-3'>
                      <div className='w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center'>
                        <HiDeviceMobile className='w-4 h-4 text-emerald-600' aria-hidden='true' />
                      </div>
                      <div>
                        <div className='text-sm font-medium text-slate-900'>{t('settings.currentDevice')}</div>
                        <div className='text-xs text-slate-500'>{t('settings.thisDeviceActiveNow')}</div>
                      </div>
                    </div>
                    <span className='px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold'>{t('settings.active')}</span>
                  </div>
                  <button
                    onClick={() => setPendingSignOutAll(true)}
                    className='w-full flex items-center justify-center gap-2 p-3 text-rose-600 border border-rose-200 rounded-xl hover:bg-rose-50 transition-colors text-sm font-medium'
                  >
                    <HiLogout className='w-4 h-4' aria-hidden='true' />{t('settings.signOutAllDevices')}</button>
                </div>
              </div>

              <div className='bg-white rounded-xl border border-rose-200 p-5'>
                <div className='flex items-center gap-3 mb-4'>
                  <div className='w-9 h-9 rounded-xl bg-rose-50 ring-1 ring-rose-100 flex items-center justify-center flex-shrink-0'>
                    <HiExclamation className='w-5 h-5 text-rose-600' aria-hidden='true' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-rose-600'>{t('settings.dangerZone.heading')}</h2>
                    <p className='text-xs text-slate-500'>{t('settings.accountClosureAndDataRequests')}</p>
                  </div>
                </div>
                <Link
                  to='/profile'
                  className='flex items-center justify-between p-4 border border-rose-200 rounded-xl hover:bg-rose-50 transition-colors group'
                >
                  <div>
                    <div className='text-sm font-medium text-rose-600'>{t('settings.closeAccount')}</div>
                    <div className='text-xs text-slate-500'>Signs you out everywhere and disables access. Records you created stay with the workspace for its audit trail &mdash; ask an admin to erase your personal data.</div>
                  </div>
                  <HiChevronRight className='w-4 h-4 text-rose-400 group-hover:text-rose-600' aria-hidden='true' />
                </Link>
              </div>
            </div>
          )}

          {/* Appearance */}
          {activeSection === 'pipeline' && currentUser?.role === 'admin' && (
            <WorkspacePipelinePanel />
          )}

          {activeSection === 'branding' && currentUser?.role === 'admin' && (
            <WorkspaceBrandingPanel />
          )}

          {activeSection === 'workspace' && currentUser?.role === 'admin' && (
            <WorkspaceScreensPanel />
          )}

          {activeSection === 'language' && (
            <LanguagePanel isAdmin={currentUser?.role === 'admin'} />
          )}

          {activeSection === 'leadSources' && currentUser?.role === 'admin' && (
            <LeadSourcesPanel />
          )}

          {activeSection === 'sequences' && currentUser?.role === 'admin' && (
            <SequencesPanel />
          )}

          {activeSection === 'email' && currentUser?.role === 'admin' && (
            <WorkspaceMailPanel />
          )}

          {activeSection === 'templates' && currentUser?.role === 'admin' && (
            <EmailTemplatesPanel />
          )}

          {activeSection === 'webhooks' && currentUser?.role === 'admin' && (
            <WebhooksPanel />
          )}

          {activeSection === 'system' && currentUser?.role === 'admin' && (
            <SystemStatusPanel />
          )}

          {activeSection === 'appearance' && (
            <div className='space-y-4'>
              <div className='bg-white rounded-xl border border-slate-200 p-5'>
                <div className='flex items-center gap-3 mb-5'>
                  <div className='w-9 h-9 rounded-xl bg-pink-50 ring-1 ring-pink-100 flex items-center justify-center flex-shrink-0'>
                    <HiColorSwatch className='w-5 h-5 text-pink-600' aria-hidden='true' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-slate-900'>{t('settings.display')}</h2>
                    <p className='text-xs text-slate-500'>{t('settings.customizeHowTheAppLooks')}</p>
                  </div>
                </div>
                <div>
                  <ToggleSwitch
                    enabled={compactMode}
                    onToggle={handleCompactModeToggle}
                    label={t('settings.compactMode')}
                    description={t('settings.reduceSpacingForMoreContentOn')}
                  />
                </div>
              </div>

              <div className='bg-white rounded-xl border border-slate-200 p-5'>
                <div className='flex items-center gap-3 mb-5'>
                  <div className='w-9 h-9 rounded-xl bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0'>
                    <HiOutlineMoon className='w-5 h-5 text-slate-600' aria-hidden='true' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-slate-900'>{t('settings.theme')}</h2>
                    <p className='text-xs text-slate-500'>{t('settings.chooseYourPreferredColorScheme')}</p>
                  </div>
                </div>
                <div className='grid grid-cols-3 gap-3'>
                  {[
                    {
                      id: 'light',
                      label: 'Light',
                      desc: 'Classic bright interface',
                      Icon: HiOutlineSun,
                      preview: (
                        <div className='w-full h-16 rounded-lg bg-slate-50 border border-slate-200 overflow-hidden'>
                          <div className='h-4 bg-white border-b border-slate-200 px-2 flex items-center gap-1'>
                            <div className='w-1.5 h-1.5 rounded-full bg-slate-300' />
                            <div className='h-1 bg-slate-200 rounded w-8' />
                          </div>
                          <div className='p-1.5 space-y-1'>
                            <div className='h-2 bg-white rounded border border-slate-100' />
                            <div className='h-2 bg-indigo-100 rounded' />
                          </div>
                        </div>
                      ),
                    },
                    {
                      id: 'dark',
                      label: 'Dark',
                      desc: 'Easy on the eyes',
                      Icon: HiOutlineMoon,
                      preview: (
                        <div className='w-full h-16 rounded-lg bg-slate-900 border border-slate-700 overflow-hidden'>
                          <div className='h-4 bg-slate-800 border-b border-slate-700 px-2 flex items-center gap-1'>
                            <div className='w-1.5 h-1.5 rounded-full bg-slate-600' />
                            <div className='h-1 bg-slate-600 rounded w-8' />
                          </div>
                          <div className='p-1.5 space-y-1'>
                            <div className='h-2 bg-slate-700 rounded' />
                            <div className='h-2 bg-indigo-900 rounded' />
                          </div>
                        </div>
                      ),
                    },
                    {
                      id: 'system',
                      label: 'System',
                      desc: 'Match OS setting',
                      Icon: HiOutlineComputerDesktop,
                      preview: (
                        <div className='w-full h-16 rounded-lg overflow-hidden border border-slate-200 flex'>
                          <div className='w-1/2 bg-slate-50'>
                            <div className='h-4 bg-white border-b border-slate-200' />
                            <div className='p-1.5 space-y-1'>
                              <div className='h-1.5 bg-slate-200 rounded' />
                            </div>
                          </div>
                          <div className='w-1/2 bg-slate-900'>
                            <div className='h-4 bg-slate-800 border-b border-slate-700' />
                            <div className='p-1.5 space-y-1'>
                              <div className='h-1.5 bg-slate-600 rounded' />
                            </div>
                          </div>
                        </div>
                      ),
                    },
                  ].map(({ id, label, desc, Icon, preview }) => (
                    <button
                      key={id}
                      type='button'
                      onClick={() => setTheme(id)}
                      aria-pressed={themePreference === id}
                      className={`p-3 rounded-xl text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                        themePreference === id
                          ? 'border-2 border-indigo-500 ring-4 ring-indigo-500/10 bg-indigo-50/50'
                          : 'border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {preview}
                      <div className='mt-3 flex items-center gap-2'>
                        <Icon className={`w-4 h-4 flex-shrink-0 ${themePreference === id ? 'text-indigo-600' : 'text-slate-400'}`} aria-hidden='true' />
                        <div>
                          <div className={`text-sm font-semibold ${themePreference === id ? 'text-indigo-700' : 'text-slate-800'}`}>
                            {label}
                          </div>
                          <div className='text-xs text-slate-500'>{desc}</div>
                        </div>
                        {themePreference === id && (
                          <div className='ml-auto w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0'>
                            <HiCheck className='w-3 h-3 text-white' aria-hidden='true' />
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      <ConfirmDialog
        open={pendingSignOutAll}
        title={t('settings.signOutFromAllDevices')}
        description={t('settings.thisWillSignYouOutFrom')}
        confirmLabel={t('settings.signOutAll')}
        onConfirm={() => { setPendingSignOutAll(false); handleSignOutAllDevices(); }}
        onCancel={() => setPendingSignOutAll(false)}
      />
    </div>
  );
}
