import { useState, useEffect } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { signOutUserSuccess } from '../redux/user/userSlice';
import { apiClient, setUserSignedOut } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { useAppearance } from '../contexts/useAppearance';
import PropTypes from 'prop-types';
import {
  HiBell,
  HiShieldCheck,
  HiEye,
  HiMail,
  HiUser,
  HiLockClosed,
  HiLogout,
  HiChevronRight,
  HiCheck,
  HiExclamation,
  HiDeviceMobile,
  HiGlobe,
  HiColorSwatch,
} from 'react-icons/hi';
import { HiOutlineSun, HiOutlineMoon, HiOutlineComputerDesktop } from 'react-icons/hi2';

export default function Settings() {
  const { currentUser } = useSelector((state) => state.user);
  const dispatch = useDispatch();
  const { showSuccess, showError } = useNotification();
  const { themePreference, setTheme, compactMode, setCompactMode } = useAppearance();

  const [settings, setSettings] = useState({
    notifications: {
      emailMessages: true,
      emailListingUpdates: true,
      emailNewsletter: false,
      pushMessages: true,
      pushListingUpdates: true,
    },
    privacy: {
      showEmail: false,
      showPhone: false,
      showOnlineStatus: true,
      allowMessages: true,
    },
  });

  const [activeSection, setActiveSection] = useState('notifications');
  const [saving, setSaving] = useState(false);
  const [pendingSignOutAll, setPendingSignOutAll] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(`settings_${currentUser?._id}`);
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (error) {
        console.error(error);
      }
    }
  }, [currentUser?._id]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      localStorage.setItem(`settings_${currentUser?._id}`, JSON.stringify(settings));
      await new Promise((r) => setTimeout(r, 500));
      showSuccess('Settings saved successfully');
    } catch (error) {
      showError('Failed to save settings');
    }
    setSaving(false);
  };

  const handleToggle = (category, key) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        [category]: {
          ...prev[category],
          [key]: !prev[category][key],
        },
      };
      try {
        if (currentUser?._id) {
          localStorage.setItem(`settings_${currentUser._id}`, JSON.stringify(next));
          window.dispatchEvent(new CustomEvent('settings:update', { detail: { userId: currentUser._id } }));
        }
      } catch (error) {
        console.error(error);
      }
      return next;
    });
  };

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
  ];

  function ToggleSwitch({ enabled, onToggle, label, description }) {
    return (
      <div className='flex items-center justify-between py-4 border-b border-slate-100 last:border-0'>
        <div className='flex-1 pr-4'>
          <div className='text-sm font-medium text-slate-900'>{label}</div>
          {description && <div className='text-xs text-slate-500 mt-0.5'>{description}</div>}
        </div>
        <button
          onClick={onToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${
            enabled ? 'bg-indigo-600' : 'bg-slate-200'
          }`}
        >
          <span
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

  return (
    <div className='space-y-6'>
      {/* Page header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
        <div>
          <h1 className='text-xl font-bold text-slate-900'>Settings</h1>
          <p className='text-sm text-slate-500 mt-0.5'>Manage your account preferences</p>
        </div>
        <div className='flex items-center gap-2'>
          <Link
            to='/profile'
            className='inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors'
          >
            <HiUser className='w-4 h-4' />
            Profile
          </Link>
          <button
            onClick={saveSettings}
            disabled={saving}
            className='inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 text-sm font-semibold transition-colors'
          >
            {saving ? (
              <>
                <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' />
                Saving...
              </>
            ) : (
              <>
                <HiCheck className='w-4 h-4' />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main grid */}
      <div className='grid grid-cols-1 lg:grid-cols-4 gap-6'>
        {/* Sidebar navigation */}
        <div className='lg:col-span-1 space-y-4'>
          <nav className='bg-white rounded-xl border border-slate-200 overflow-hidden'>
            {menuItems.map((item) => (
              <button
                key={item.id}
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
                  <item.icon className={`w-4 h-4 ${activeSection === item.id ? 'text-indigo-600' : 'text-slate-500'}`} />
                </div>
                <div className='flex-1 min-w-0'>
                  <div className='text-sm font-medium'>{item.label}</div>
                  <div className='text-xs text-slate-500 mt-0.5 truncate hidden sm:block'>{item.description}</div>
                </div>
                <HiChevronRight className={`w-4 h-4 flex-shrink-0 ${activeSection === item.id ? 'text-indigo-400' : 'text-slate-300'}`} />
              </button>
            ))}
          </nav>

          {/* Account info card */}
          <div className='bg-white rounded-xl border border-slate-200 p-4'>
            <div className='flex items-center gap-3'>
              <img
                src={currentUser?.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
                alt='avatar'
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
                  <div className='w-9 h-9 rounded-xl bg-blue-50 ring-1 ring-blue-100 flex items-center justify-center flex-shrink-0'>
                    <HiMail className='w-5 h-5 text-blue-600' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-slate-900'>Email Notifications</h2>
                    <p className='text-xs text-slate-500'>Choose what emails you want to receive</p>
                  </div>
                </div>
                <div>
                  <ToggleSwitch
                    enabled={settings.notifications.emailMessages}
                    onToggle={() => handleToggle('notifications', 'emailMessages')}
                    label='New Messages'
                    description='Get notified when you receive a new message'
                  />
                  <ToggleSwitch
                    enabled={settings.notifications.emailListingUpdates}
                    onToggle={() => handleToggle('notifications', 'emailListingUpdates')}
                    label='Listing Updates'
                    description='Updates about your listed properties'
                  />
                  <ToggleSwitch
                    enabled={settings.notifications.emailNewsletter}
                    onToggle={() => handleToggle('notifications', 'emailNewsletter')}
                    label='Newsletter'
                    description='Weekly digest of new properties and market trends'
                  />
                </div>
              </div>

              <div className='bg-white rounded-xl border border-slate-200 p-5'>
                <div className='flex items-center gap-3 mb-5'>
                  <div className='w-9 h-9 rounded-xl bg-violet-50 ring-1 ring-violet-100 flex items-center justify-center flex-shrink-0'>
                    <HiBell className='w-5 h-5 text-violet-600' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-slate-900'>Push Notifications</h2>
                    <p className='text-xs text-slate-500'>Manage in-app notifications</p>
                  </div>
                </div>
                <div>
                  <ToggleSwitch
                    enabled={settings.notifications.pushMessages}
                    onToggle={() => handleToggle('notifications', 'pushMessages')}
                    label='Message Alerts'
                    description='Show notifications for new messages'
                  />
                  <ToggleSwitch
                    enabled={settings.notifications.pushListingUpdates}
                    onToggle={() => handleToggle('notifications', 'pushListingUpdates')}
                    label='Listing Alerts'
                    description='Get notified about listing status changes'
                  />
                </div>
              </div>
            </div>
          )}

          {/* Privacy */}
          {activeSection === 'privacy' && (
            <div className='space-y-4'>
              <div className='bg-white rounded-xl border border-slate-200 p-5'>
                <div className='flex items-center gap-3 mb-5'>
                  <div className='w-9 h-9 rounded-xl bg-emerald-50 ring-1 ring-emerald-100 flex items-center justify-center flex-shrink-0'>
                    <HiEye className='w-5 h-5 text-emerald-600' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-slate-900'>Profile Visibility</h2>
                    <p className='text-xs text-slate-500'>Control what others can see</p>
                  </div>
                </div>
                <div>
                  <ToggleSwitch
                    enabled={settings.privacy.showEmail}
                    onToggle={() => handleToggle('privacy', 'showEmail')}
                    label='Show Email Address'
                    description='Allow other users to see your email'
                  />
                  <ToggleSwitch
                    enabled={settings.privacy.showPhone}
                    onToggle={() => handleToggle('privacy', 'showPhone')}
                    label='Show Phone Number'
                    description='Display your phone number on your profile'
                  />
                  <ToggleSwitch
                    enabled={settings.privacy.showOnlineStatus}
                    onToggle={() => handleToggle('privacy', 'showOnlineStatus')}
                    label='Show Online Status'
                    description='Let others see when you are online'
                  />
                </div>
              </div>

              <div className='bg-white rounded-xl border border-slate-200 p-5'>
                <div className='flex items-center gap-3 mb-5'>
                  <div className='w-9 h-9 rounded-xl bg-indigo-50 ring-1 ring-indigo-100 flex items-center justify-center flex-shrink-0'>
                    <HiGlobe className='w-5 h-5 text-indigo-600' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-slate-900'>Communication</h2>
                    <p className='text-xs text-slate-500'>Manage who can contact you</p>
                  </div>
                </div>
                <div>
                  <ToggleSwitch
                    enabled={settings.privacy.allowMessages}
                    onToggle={() => handleToggle('privacy', 'allowMessages')}
                    label='Allow Direct Messages'
                    description='Let other users send you messages'
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
                    <HiLockClosed className='w-5 h-5 text-rose-600' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-slate-900'>Password & Authentication</h2>
                    <p className='text-xs text-slate-500'>Manage your account security</p>
                  </div>
                </div>
                <Link
                  to='/password-reset'
                  className='flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors group'
                >
                  <div className='flex items-center gap-3'>
                    <div className='w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center'>
                      <HiLockClosed className='w-4 h-4 text-slate-500' />
                    </div>
                    <div>
                      <div className='text-sm font-medium text-slate-900'>Change Password</div>
                      <div className='text-xs text-slate-500'>Update your password regularly for security</div>
                    </div>
                  </div>
                  <HiChevronRight className='w-4 h-4 text-slate-400 group-hover:text-slate-600' />
                </Link>
              </div>

              <div className='bg-white rounded-xl border border-slate-200 p-5'>
                <div className='flex items-center gap-3 mb-5'>
                  <div className='w-9 h-9 rounded-xl bg-amber-50 ring-1 ring-amber-100 flex items-center justify-center flex-shrink-0'>
                    <HiDeviceMobile className='w-5 h-5 text-amber-600' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-slate-900'>Active Sessions</h2>
                    <p className='text-xs text-slate-500'>Manage devices where you&apos;re logged in</p>
                  </div>
                </div>
                <div className='space-y-3'>
                  <div className='flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-xl'>
                    <div className='flex items-center gap-3'>
                      <div className='w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center'>
                        <HiDeviceMobile className='w-4 h-4 text-emerald-600' />
                      </div>
                      <div>
                        <div className='text-sm font-medium text-slate-900'>Current Device</div>
                        <div className='text-xs text-slate-500'>This device · Active now</div>
                      </div>
                    </div>
                    <span className='px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold'>
                      Active
                    </span>
                  </div>
                  <button
                    onClick={() => setPendingSignOutAll(true)}
                    className='w-full flex items-center justify-center gap-2 p-3 text-rose-600 border border-rose-200 rounded-xl hover:bg-rose-50 transition-colors text-sm font-medium'
                  >
                    <HiLogout className='w-4 h-4' />
                    Sign Out All Devices
                  </button>
                </div>
              </div>

              <div className='bg-white rounded-xl border border-rose-200 p-5'>
                <div className='flex items-center gap-3 mb-4'>
                  <div className='w-9 h-9 rounded-xl bg-rose-50 ring-1 ring-rose-100 flex items-center justify-center flex-shrink-0'>
                    <HiExclamation className='w-5 h-5 text-rose-600' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-rose-600'>Danger Zone</h2>
                    <p className='text-xs text-slate-500'>Irreversible actions</p>
                  </div>
                </div>
                <Link
                  to='/profile'
                  className='flex items-center justify-between p-4 border border-rose-200 rounded-xl hover:bg-rose-50 transition-colors group'
                >
                  <div>
                    <div className='text-sm font-medium text-rose-600'>Delete Account</div>
                    <div className='text-xs text-slate-500'>Permanently delete your account and all data</div>
                  </div>
                  <HiChevronRight className='w-4 h-4 text-rose-400 group-hover:text-rose-600' />
                </Link>
              </div>
            </div>
          )}

          {/* Appearance */}
          {activeSection === 'appearance' && (
            <div className='space-y-4'>
              <div className='bg-white rounded-xl border border-slate-200 p-5'>
                <div className='flex items-center gap-3 mb-5'>
                  <div className='w-9 h-9 rounded-xl bg-pink-50 ring-1 ring-pink-100 flex items-center justify-center flex-shrink-0'>
                    <HiColorSwatch className='w-5 h-5 text-pink-600' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-slate-900'>Display</h2>
                    <p className='text-xs text-slate-500'>Customize how the app looks</p>
                  </div>
                </div>
                <div>
                  <ToggleSwitch
                    enabled={compactMode}
                    onToggle={handleCompactModeToggle}
                    label='Compact Mode'
                    description='Reduce spacing for more content on screen'
                  />
                </div>
              </div>

              <div className='bg-white rounded-xl border border-slate-200 p-5'>
                <div className='flex items-center gap-3 mb-5'>
                  <div className='w-9 h-9 rounded-xl bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0'>
                    <HiOutlineMoon className='w-5 h-5 text-slate-600' />
                  </div>
                  <div>
                    <h2 className='text-base font-semibold text-slate-900'>Theme</h2>
                    <p className='text-xs text-slate-500'>Choose your preferred color scheme</p>
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
                      className={`p-3 rounded-xl text-left transition-all ${
                        themePreference === id
                          ? 'border-2 border-indigo-500 ring-4 ring-indigo-500/10 bg-indigo-50/50'
                          : 'border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {preview}
                      <div className='mt-3 flex items-center gap-2'>
                        <Icon className={`w-4 h-4 flex-shrink-0 ${themePreference === id ? 'text-indigo-600' : 'text-slate-400'}`} />
                        <div>
                          <div className={`text-sm font-semibold ${themePreference === id ? 'text-indigo-700' : 'text-slate-800'}`}>
                            {label}
                          </div>
                          <div className='text-xs text-slate-500'>{desc}</div>
                        </div>
                        {themePreference === id && (
                          <div className='ml-auto w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0'>
                            <HiCheck className='w-3 h-3 text-white' />
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
        title='Sign out from all devices?'
        description='This will sign you out from all devices including this one.'
        confirmLabel='Sign Out All'
        onConfirm={() => { setPendingSignOutAll(false); handleSignOutAllDevices(); }}
        onCancel={() => setPendingSignOutAll(false)}
      />
    </div>
  );
}
