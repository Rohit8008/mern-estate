import { useState, useEffect, useId } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useSearchParams } from 'react-router-dom';
import { signOutUserSuccess } from '../redux/user/userSlice';
import { apiClient, setUserSignedOut, normalizeImageUrl } from '../utils/http';
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
import TagsPanel from '../components/TagsPanel';
import SystemStatusPanel from '../components/SystemStatusPanel';
import LanguagePanel from '../components/LanguagePanel';
import SequencesPanel from '../components/SequencesPanel';
import WorkspaceRulesPanel from '../components/WorkspaceRulesPanel';
import SearchInsightsPanel from '../components/SearchInsightsPanel';
import DataRightsPanel from '../components/DataRightsPanel';
import { useTenant } from '../contexts/TenantProvider';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, PageHeader, Skeleton, Switch, Tabs, TabPanel,
  Table, Thead, Th, Tbody, Tr, Td,
} from '../design-system';
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
  HiAdjustments,
  HiSearch,
  HiDocumentText,
  HiOutlineUserCircle,
  HiOutlineOfficeBuilding,
  HiOutlineTrendingUp,
  HiOutlinePuzzle,
  HiOutlineChip,
} from 'react-icons/hi';
import { HiOutlineSun, HiOutlineMoon, HiOutlineComputerDesktop } from 'react-icons/hi2';

function cx(...xs) { return xs.filter(Boolean).join(' '); }

/**
 * A labelled on/off row. Defined at module level, not inside Settings: a
 * component declared in the render body is a new type on every render, so
 * React remounted every row — and dropped keyboard focus — each time a toggle
 * flipped.
 */
function ToggleRow({ enabled, onToggle, label, description }) {
  const id = useId();
  return (
    <div className='flex items-center justify-between gap-4 py-4 border-b border-border last:border-0'>
      <div className='flex-1 min-w-0'>
        <div id={`${id}-label`} className='text-sm font-medium text-foreground'>{label}</div>
        {description && <div id={`${id}-desc`} className='text-xs text-muted-foreground mt-0.5'>{description}</div>}
      </div>
      <Switch
        checked={enabled}
        onChange={onToggle}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
      />
    </div>
  );
}

ToggleRow.propTypes = {
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
function MatrixCheck({ checked, onChange, label }) {
  return (
    <button
      type='button'
      role='checkbox'
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cx(
        'w-5 h-5 rounded-md border flex items-center justify-center transition-colors mx-auto',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
        checked ? 'bg-brand-600 border-brand-600 text-white' : 'bg-card border-border hover:border-slate-400'
      )}
    >
      {checked && <HiCheck className='w-3.5 h-3.5' aria-hidden='true' />}
    </button>
  );
}

MatrixCheck.propTypes = {
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
};

/** The icon-and-heading row every settings card opens with. */
function SectionHeading({ icon: Icon, tone, title, description, danger = false }) {
  return (
    <div className='flex items-center gap-3 mb-5'>
      <div className={cx('w-9 h-9 rounded-xl ring-1 flex items-center justify-center flex-shrink-0', TONE[tone])}>
        <Icon className='w-5 h-5' aria-hidden='true' />
      </div>
      <div className='min-w-0'>
        <h2 className={cx('text-base font-semibold', danger ? 'text-rose-600' : 'text-foreground')}>{title}</h2>
        {description && <p className='text-xs text-muted-foreground'>{description}</p>}
      </div>
    </div>
  );
}

SectionHeading.propTypes = {
  icon: PropTypes.elementType.isRequired,
  tone: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  danger: PropTypes.bool,
};

// Literal strings: Tailwind cannot see an interpolated `bg-${tone}-50`.
const TONE = {
  brand:   'bg-brand-50 ring-brand-100 text-brand-600',
  emerald: 'bg-emerald-50 ring-emerald-100 text-emerald-600',
  rose:    'bg-rose-50 ring-rose-100 text-rose-600',
  amber:   'bg-amber-50 ring-amber-100 text-amber-600',
  pink:    'bg-pink-50 ring-pink-100 text-pink-600',
  slate:   'bg-slate-100 ring-slate-200 text-slate-600',
};

/**
 * How a new lead finds an agent. Stored as `workflow.leadAssignment` and read by
 * the server when a lead is created without a named owner; until this control
 * existed the setting could only be changed by editing the database.
 */
const LEAD_ASSIGNMENT_OPTIONS = [
  { value: 'manual', label: 'Manual', hint: 'The person who adds the lead owns it, or names an owner.' },
  { value: 'round_robin', label: 'Round robin', hint: 'Each new lead goes to the agent with the fewest open leads.' },
  { value: 'by_locality', label: 'By locality', hint: 'A lead goes to the agent who already owns the most leads in its locality; a new locality falls back to round robin.' },
];

function LeadAssignmentSetting() {
  const { tenant, refresh } = useTenant();
  const { showSuccess, showError } = useNotification();
  const selectId = useId();
  const current = tenant?.workflow?.leadAssignment || 'manual';
  const [saving, setSaving] = useState(false);

  const change = async (value) => {
    if (value === current) return;
    setSaving(true);
    try {
      await apiClient.patch('/tenant/config', { workflow: { leadAssignment: value } });
      await refresh?.();
      showSuccess('Lead assignment updated');
    } catch (err) {
      showError(err?.message || 'Could not update lead assignment');
    } finally {
      setSaving(false);
    }
  };

  const hint = LEAD_ASSIGNMENT_OPTIONS.find((o) => o.value === current)?.hint;

  return (
    <Card className='mb-6'>
      <label htmlFor={selectId} className='block text-sm font-semibold text-foreground'>Lead assignment</label>
      <p className='text-xs text-muted-foreground mt-0.5 mb-2'>How a new lead is given to an agent when nobody is named.</p>
      <select
        id={selectId}
        value={current}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
        className='w-full sm:w-64 rounded-lg border border-border bg-card text-sm text-foreground px-3 py-2 disabled:opacity-60'
      >
        {LEAD_ASSIGNMENT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <p className='text-xs text-muted-foreground mt-1.5'>{hint}</p>}
    </Card>
  );
}

export default function Settings() {
  const { currentUser } = useSelector((state) => state.user);
  const dispatch = useDispatch();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation();
  const { themePreference, setTheme, compactMode, setCompactMode } = useAppearance();
  const isAdmin = currentUser?.role === 'admin';

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

  /**
   * Sections grouped into tabs. Section ids are unchanged from the flat menu
   * this replaced — `?section=branding` is linked from the onboarding
   * checklist (backend tenant.controller.js) — so an old link still lands.
   *
   * Everything outside "Account" is workspace-wide rather than personal, so
   * only an admin sees it; everyone else's settings here affect only their own
   * account. A group with no visible sections is not offered at all.
   */
  const groups = [
    {
      value: 'account',
      label: t('settings.groups.account'),
      icon: HiOutlineUserCircle,
      sections: [
        { id: 'notifications', label: t('settings.tabs.notifications'), icon: HiBell, description: 'Manage how you receive notifications' },
        { id: 'privacy', label: t('settings.tabs.privacy'), icon: HiEye, description: 'Control your privacy settings' },
        { id: 'security', label: t('settings.tabs.security'), icon: HiShieldCheck, description: 'Protect your account' },
        { id: 'appearance', label: t('settings.tabs.appearance'), icon: HiColorSwatch, description: 'Customize your experience' },
        { id: 'language', label: t('settings.tabs.language'), icon: HiGlobe, description: t('settings.language.description') },
      ],
    },
    {
      value: 'workspace',
      label: t('settings.groups.workspace'),
      icon: HiOutlineOfficeBuilding,
      sections: isAdmin ? [
        { id: 'branding', label: t('settings.tabs.branding'), icon: HiOfficeBuilding, description: 'Your name, logo, colours and units' },
        { id: 'workspace', label: t('settings.tabs.workspace'), icon: HiViewGrid, description: 'Choose which screens your team uses' },
        { id: 'rules', label: 'Rules', icon: HiAdjustments, description: 'Automatic checks and clean-ups' },
      ] : [],
    },
    {
      value: 'sales',
      label: t('settings.groups.sales'),
      icon: HiOutlineTrendingUp,
      sections: isAdmin ? [
        { id: 'pipeline', label: t('settings.tabs.pipeline'), icon: HiViewBoards, description: 'The stages your deals move through' },
        { id: 'leadSources', label: t('settings.tabs.leadSources'), icon: HiTag, description: 'Your channels, and what each costs per month' },
        { id: 'tags', label: t('settings.tabs.tags'), icon: HiTag, description: 'Rename, recolour or remove the labels on your records' },
        { id: 'sequences', label: t('settings.tabs.sequences'), icon: HiLightningBolt, description: 'Multi-step follow-ups that run on their own' },
        { id: 'templates', label: t('settings.tabs.templates'), icon: HiTemplate, description: 'Your wording for what the CRM sends' },
      ] : [],
    },
    {
      value: 'integrations',
      label: t('settings.groups.integrations'),
      icon: HiOutlinePuzzle,
      sections: isAdmin ? [
        { id: 'email', label: t('settings.tabs.email'), icon: HiMail, description: 'Send mail from your own address' },
        { id: 'webhooks', label: t('settings.tabs.webhooks'), icon: HiLink, description: 'Forward events to another system' },
      ] : [],
    },
    {
      value: 'system',
      label: t('settings.groups.system'),
      icon: HiOutlineChip,
      sections: isAdmin ? [
        { id: 'system', label: t('settings.tabs.system'), icon: HiServer, description: 'Version, database, scheduled jobs' },
        { id: 'searchInsights', label: 'Search insights', icon: HiSearch, description: 'What your team searches for' },
        { id: 'dataRequests', label: 'Data requests', icon: HiDocumentText, description: 'Export or erase a person’s data' },
      ] : [],
    },
  ].filter((g) => g.sections.length > 0);

  // The URL is the state: `?tab=<group>&section=<id>`, so a tab is linkable
  // and survives a reload. A known section wins (it implies its group); else a
  // known tab opens on its first section; anything else falls back to the
  // first thing this user can see — never a blank pane for an id they lack.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('section');
  const requestedTab = searchParams.get('tab');
  const groupOfSection = groups.find((g) => g.sections.some((s) => s.id === requestedSection));
  const activeGroup = groupOfSection || groups.find((g) => g.value === requestedTab) || groups[0];
  const activeSection = groupOfSection ? requestedSection : activeGroup.sections[0].id;
  const activeMeta = activeGroup.sections.find((s) => s.id === activeSection);
  const hasTabs = groups.length > 1;

  const go = (tab, section) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      next.set('section', section);
      return next;
    }, { replace: true });
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'notifications':
        return (
          <Card>
            <SectionHeading
              icon={HiBell}
              tone='brand'
              title={t('settings.notifications.heading')}
              description={t('settings.chooseWhatReachesYouInThe')}
            />
            {loadingPrefs ? (
              <div className='space-y-3 py-2' aria-busy='true' aria-label={t('common.loading')}>
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className='h-10 w-full' />)}
              </div>
            ) : Object.keys(catalogue).length === 0 ? (
              <p className='text-sm text-muted-foreground py-4'>{t('settings.noNotificationTypesAvailable')}</p>
            ) : (
              <Table className='min-w-[26rem]'>
                <Thead>
                  <tr>
                    <Th>{t('settings.event')}</Th>
                    <Th className='text-center w-24'>{t('settings.inApp')}</Th>
                    <Th className='text-center w-24'>{t('settings.email')}</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {Object.entries(catalogue).map(([type, meta]) => {
                    const pref = notificationPrefs[type] || { inApp: true, email: false };
                    // The catalogue comes from the server, which stays the
                    // single source of WHICH types exist. The wording is
                    // translated by the type's stable id, falling back to the
                    // server's English when a locale has no entry — so a new
                    // type shows up immediately rather than waiting on a
                    // translation.
                    const label = t(`settings.notificationTypes.${type}.label`, meta.label);
                    return (
                      <Tr key={type}>
                        <Td className='whitespace-normal'>
                          <div className='text-sm font-medium text-foreground'>{label}</div>
                          <div className='text-xs text-muted-foreground'>
                            {t(`settings.notificationTypes.${type}.description`, meta.description)}
                          </div>
                        </Td>
                        <Td className='text-center'>
                          <MatrixCheck
                            checked={pref.inApp !== false}
                            onChange={() => toggleNotification(type, 'inApp')}
                            label={`${label} in app`}
                          />
                        </Td>
                        <Td className='text-center'>
                          <MatrixCheck
                            checked={pref.email === true}
                            onChange={() => toggleNotification(type, 'email')}
                            label={`${label} by email`}
                          />
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            )}
          </Card>
        );

      case 'privacy':
        return (
          <div className='space-y-4'>
            <Card>
              <SectionHeading icon={HiEye} tone='emerald' title={t('settings.profileVisibility')} description={t('settings.controlWhatOthersCanSee')} />
              <ToggleRow
                enabled={privacy.showEmail}
                onToggle={() => togglePrivacy('showEmail')}
                label={t('settings.showEmailAddress')}
                description={t('settings.allowOtherUsersToSeeYour')}
              />
              <ToggleRow
                enabled={privacy.showPhone}
                onToggle={() => togglePrivacy('showPhone')}
                label={t('settings.showPhoneNumber')}
                description={t('settings.displayYourPhoneNumberOnYour')}
              />
              <ToggleRow
                enabled={privacy.showOnlineStatus}
                onToggle={() => togglePrivacy('showOnlineStatus')}
                label={t('settings.showOnlineStatus')}
                description={t('settings.letOthersSeeWhenYouAre')}
              />
            </Card>
            <Card>
              <SectionHeading icon={HiGlobe} tone='brand' title={t('settings.communication')} description={t('settings.manageWhoCanContactYou')} />
              <ToggleRow
                enabled={privacy.allowMessages}
                onToggle={() => togglePrivacy('allowMessages')}
                label={t('settings.allowDirectMessages')}
                description={t('settings.letOtherUsersSendYouMessages')}
              />
            </Card>
          </div>
        );

      case 'security':
        return (
          <div className='space-y-4'>
            <Card>
              <SectionHeading icon={HiLockClosed} tone='rose' title={t('settings.passwordAuthentication')} description={t('settings.manageYourAccountSecurity')} />
              <Link
                to='/password-reset'
                className='flex items-center justify-between p-4 border border-border rounded-xl hover:bg-accent transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
              >
                <div className='flex items-center gap-3'>
                  <div className='w-8 h-8 rounded-lg bg-secondary flex items-center justify-center'>
                    <HiLockClosed className='w-4 h-4 text-muted-foreground' aria-hidden='true' />
                  </div>
                  <div>
                    <div className='text-sm font-medium text-foreground'>{t('settings.changePassword')}</div>
                    <div className='text-xs text-muted-foreground'>{t('settings.updateYourPasswordRegularlyForSecurity')}</div>
                  </div>
                </div>
                <HiChevronRight className='w-4 h-4 text-muted-foreground group-hover:text-foreground' aria-hidden='true' />
              </Link>
            </Card>

            <Card>
              <SectionHeading icon={HiDeviceMobile} tone='amber' title={t('settings.activeSessions')} description="Manage devices where you're logged in" />
              <div className='space-y-3'>
                <div className='flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-xl dark:bg-emerald-950/30 dark:border-emerald-900'>
                  <div className='flex items-center gap-3'>
                    <div className='w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center dark:bg-emerald-900/50'>
                      <HiDeviceMobile className='w-4 h-4 text-emerald-600' aria-hidden='true' />
                    </div>
                    <div>
                      <div className='text-sm font-medium text-foreground'>{t('settings.currentDevice')}</div>
                      <div className='text-xs text-muted-foreground'>{t('settings.thisDeviceActiveNow')}</div>
                    </div>
                  </div>
                  <span className='px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold'>{t('settings.active')}</span>
                </div>
                <button
                  type='button'
                  onClick={() => setPendingSignOutAll(true)}
                  className='w-full flex items-center justify-center gap-2 p-3 text-rose-600 border border-rose-200 rounded-xl hover:bg-rose-50 transition-colors text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-rose-900 dark:hover:bg-rose-950/30'
                >
                  <HiLogout className='w-4 h-4' aria-hidden='true' />{t('settings.signOutAllDevices')}
                </button>
              </div>
            </Card>

            <Card className='border-rose-200 dark:border-rose-900'>
              <SectionHeading icon={HiExclamation} tone='rose' danger title={t('settings.dangerZone.heading')} description={t('settings.accountClosureAndDataRequests')} />
              <Link
                to='/profile'
                className='flex items-center justify-between gap-3 p-4 border border-rose-200 rounded-xl hover:bg-rose-50 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-rose-900 dark:hover:bg-rose-950/30'
              >
                <div>
                  <div className='text-sm font-medium text-rose-600'>{t('settings.closeAccount')}</div>
                  <div className='text-xs text-muted-foreground'>Signs you out everywhere and disables access. Records you created stay with the workspace for its audit trail &mdash; ask an admin to erase your personal data.</div>
                </div>
                <HiChevronRight className='w-4 h-4 flex-shrink-0 text-rose-400 group-hover:text-rose-600' aria-hidden='true' />
              </Link>
            </Card>
          </div>
        );

      case 'appearance':
        return (
          <div className='space-y-4'>
            <Card>
              <SectionHeading icon={HiColorSwatch} tone='pink' title={t('settings.display')} description={t('settings.customizeHowTheAppLooks')} />
              <ToggleRow
                enabled={compactMode}
                onToggle={handleCompactModeToggle}
                label={t('settings.compactMode')}
                description={t('settings.reduceSpacingForMoreContentOn')}
              />
            </Card>

            <Card>
              <SectionHeading icon={HiOutlineMoon} tone='slate' title={t('settings.theme')} description={t('settings.chooseYourPreferredColorScheme')} />
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
                {THEMES.map(({ id, label, desc, Icon, preview }) => {
                  const selected = themePreference === id;
                  return (
                    <button
                      key={id}
                      type='button'
                      onClick={() => setTheme(id)}
                      aria-pressed={selected}
                      className={cx(
                        'p-3 rounded-xl text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                        selected
                          ? 'border-2 border-brand-500 ring-4 ring-brand-500/10 bg-brand-50/50'
                          : 'border border-border hover:border-slate-300 hover:bg-accent'
                      )}
                    >
                      {preview}
                      <div className='mt-3 flex items-center gap-2'>
                        <Icon className={cx('w-4 h-4 flex-shrink-0', selected ? 'text-brand-600' : 'text-muted-foreground')} aria-hidden='true' />
                        <div>
                          <div className={cx('text-sm font-semibold', selected ? 'text-brand-700' : 'text-foreground')}>{label}</div>
                          <div className='text-xs text-muted-foreground'>{desc}</div>
                        </div>
                        {selected && (
                          <div className='ml-auto w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0'>
                            <HiCheck className='w-3 h-3 text-white' aria-hidden='true' />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>
        );

      case 'language':
        return <LanguagePanel isAdmin={isAdmin} />;

      // Workspace-wide panels. The group list above already hides them from
      // non-admins; the role check is repeated here so a hand-typed
      // ?section=webhooks can never mount one for someone else.
      case 'branding':    return isAdmin ? <WorkspaceBrandingPanel /> : null;
      case 'workspace':   return isAdmin ? (<><LeadAssignmentSetting /><WorkspaceScreensPanel /></>) : null;
      case 'pipeline':    return isAdmin ? <WorkspacePipelinePanel /> : null;
      case 'leadSources': return isAdmin ? <LeadSourcesPanel /> : null;
      case 'tags':        return isAdmin ? <TagsPanel /> : null;
      case 'sequences':   return isAdmin ? <SequencesPanel /> : null;
      case 'email':       return isAdmin ? <WorkspaceMailPanel /> : null;
      case 'templates':   return isAdmin ? <EmailTemplatesPanel /> : null;
      case 'webhooks':    return isAdmin ? <WebhooksPanel /> : null;
      case 'rules':       return isAdmin ? <WorkspaceRulesPanel /> : null;
      case 'system':      return isAdmin ? <SystemStatusPanel /> : null;
      case 'searchInsights': return isAdmin ? <SearchInsightsPanel /> : null;
      case 'dataRequests':   return isAdmin ? <DataRightsPanel /> : null;
      default:            return null;
    }
  };

  const roleBadge = currentUser?.role === 'admin'
    ? 'bg-rose-100 text-rose-700'
    : currentUser?.role === 'employee'
      ? 'bg-brand-100 text-brand-700'
      : 'bg-emerald-100 text-emerald-700';

  return (
    <div className='space-y-6'>
      <PageHeader
        title={t('settings.settings')}
        description={t('settings.manageYourAccountPreferences')}
        actions={
          <>
            <Button as={Link} to='/profile' variant='secondary' icon={HiUser}>{t('settings.profile')}</Button>
            {/* This saves notification and privacy preferences only. On the
                workspace tabs it sat next to the panel's own save and did
                nothing for what had just been edited, so it shows only where
                it applies. */}
            {(activeSection === 'notifications' || activeSection === 'privacy') && (
              <Button onClick={saveSettings} loading={saving} disabled={saving} icon={HiCheck}>
                {saving ? t('settings.saving') : t('settings.saveChanges')}
              </Button>
            )}
          </>
        }
      />

      {/* One tab per group. A single group (a non-admin sees only Account)
          needs no strip: a lone tab is a heading pretending to be a control. */}
      {hasTabs && (
        <Tabs
          id='settings'
          items={groups.map(({ value, label, icon }) => ({ value, label, icon }))}
          value={activeGroup.value}
          onChange={(value) => go(value, groups.find((g) => g.value === value).sections[0].id)}
        />
      )}

      {/* Without a tab strip there is nothing for a tabpanel to belong to. */}
      <GroupBody hasTabs={hasTabs} value={activeGroup.value}>
        <div className='grid grid-cols-1 lg:grid-cols-4 gap-6'>
          {/* Sections within the group: a column on a desktop, a scrolling
              row of pills on a phone — one list, restyled by breakpoint. */}
          <div className='lg:col-span-1 space-y-4 min-w-0'>
            {activeGroup.sections.length > 1 && (
              <nav aria-label={t('settings.sectionsNav', { group: activeGroup.label })}>
                <ul className='flex lg:flex-col gap-1 overflow-x-auto scrollbar-thin -mx-4 px-4 lg:mx-0 lg:px-0 lg:p-1.5 lg:bg-card lg:border lg:border-border lg:rounded-xl'>
                  {activeGroup.sections.map((item) => {
                    const selected = item.id === activeSection;
                    return (
                      <li key={item.id} className='flex-shrink-0 lg:flex-shrink'>
                        <button
                          type='button'
                          aria-current={selected ? 'page' : undefined}
                          onClick={() => go(activeGroup.value, item.id)}
                          className={cx(
                            'w-full flex items-center gap-3 text-left transition-colors rounded-lg whitespace-nowrap lg:whitespace-normal',
                            'px-3 py-2 lg:py-2.5 border lg:border-0',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                            selected
                              ? 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-950/40 dark:text-brand-300'
                              : 'text-foreground/80 border-border hover:bg-accent hover:text-foreground'
                          )}
                        >
                          <item.icon className={cx('w-4 h-4 flex-shrink-0', selected ? 'text-brand-600' : 'text-muted-foreground')} aria-hidden='true' />
                          <span className='min-w-0'>
                            <span className='block text-sm font-medium'>{item.label}</span>
                            <span className='hidden lg:block text-xs text-muted-foreground mt-0.5 truncate'>{item.description}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            )}

            {/* Account info card */}
            <div className='hidden lg:block bg-card border border-border rounded-xl p-4'>
              <div className='flex items-center gap-3'>
                <img
                  src={currentUser?.avatar ? normalizeImageUrl(currentUser.avatar) : DEFAULT_AVATAR_URL}
                  alt=''
                  className='w-10 h-10 rounded-full object-cover ring-2 ring-border'
                />
                <div className='flex-1 min-w-0'>
                  <div className='text-sm font-semibold text-foreground truncate'>{currentUser?.username}</div>
                  <div className='text-xs text-muted-foreground truncate'>{currentUser?.email}</div>
                </div>
              </div>
              <div className='mt-3 pt-3 border-t border-border'>
                <span className={cx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold', roleBadge)}>
                  {currentUser?.role === 'admin' ? 'Admin' : currentUser?.role === 'employee' ? 'Employee' : 'User'}
                </span>
              </div>
            </div>
          </div>

          {/* Settings content */}
          <section className='lg:col-span-3 min-w-0' aria-label={activeMeta?.label}>
            {renderSection()}
          </section>
        </div>
      </GroupBody>

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

function GroupBody({ hasTabs, value, children }) {
  if (!hasTabs) return <div>{children}</div>;
  return <TabPanel tabsId='settings' value={value} active={value}>{children}</TabPanel>;
}

GroupBody.propTypes = {
  hasTabs: PropTypes.bool.isRequired,
  value: PropTypes.string.isRequired,
  children: PropTypes.node,
};

/** Theme choices with a miniature of each. Module-level: it never changes. */
const THEMES = [
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
          <div className='h-2 bg-brand-100 rounded' />
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
          <div className='h-2 bg-brand-900 rounded' />
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
];
