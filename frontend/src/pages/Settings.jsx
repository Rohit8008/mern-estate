import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import { signOutUserSuccess } from '../redux/user/userSlice';
import { useNotification } from '../contexts/NotificationContext';
import { useAppearance } from '../contexts/useAppearance';
import PropTypes from 'prop-types';
import {
  HiBell,
  HiShieldCheck,
  HiEye,
  HiMail,
  HiCog,
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

export default function Settings() {
  const { currentUser } = useSelector((state) => state.user);
  const dispatch = useDispatch();
  const { showSuccess, showError } = useNotification();
  const { themePreference, setTheme, compactMode, setCompactMode } = useAppearance();

  // Settings state
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

  // Load settings from localStorage on mount
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

  // Save settings to localStorage
  const saveSettings = async () => {
    setSaving(true);
    try {
      localStorage.setItem(`settings_${currentUser?._id}`, JSON.stringify(settings));
      await new Promise((r) => setTimeout(r, 500)); // Simulate API call
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

  const handleCompactModeToggle = () => {
    setCompactMode(!compactMode);
  };

  const handleSignOutAllDevices = async () => {
    if (!confirm('This will sign you out from all devices including this one. Continue?')) return;
    try {
      // In a real app, this would call an API to invalidate all sessions
      await fetch('/api/auth/signout-all', { method: 'POST', credentials: 'include' }).catch(() => {});
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
    <div className='flex items-center justify-between py-4 border-b border-gray-100 last:border-0'>
      <div className='flex-1'>
        <div className='font-medium text-gray-900'>{label}</div>
        {description && <div className='text-sm text-gray-500 mt-0.5'>{description}</div>}
      </div>
      <button
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          enabled ? 'bg-blue-600' : 'bg-gray-200'
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
    <div className='min-h-screen bg-gray-50'>
      {/* Header */}
      <div className='bg-white shadow-sm border-b border-gray-200'>
        <div className='max-w-6xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex justify-between items-center py-6'>
            <div>
              <h1 className='text-2xl font-bold text-gray-900'>Settings</h1>
              <p className='text-sm text-gray-600 mt-1'>Manage your account preferences</p>
            </div>
            <div className='flex items-center gap-3'>
              <Link
                to='/profile'
                className='px-4 py-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2'
              >
                <HiUser className='w-4 h-4' />
                Profile
              </Link>
              <button
                onClick={saveSettings}
                disabled={saving}
                className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2'
              >
                {saving ? (
                  <>
                    <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin'></div>
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
        </div>
      </div>

      {/* Main Content */}
      <div className='max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
        <div className='grid grid-cols-1 lg:grid-cols-4 gap-6'>
          {/* Sidebar Navigation */}
          <div className='lg:col-span-1'>
            <nav className='bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden'>
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-4 text-left transition-colors border-b border-gray-100 last:border-0 ${
                    activeSection === item.id
                      ? 'bg-blue-50 text-blue-700 border-l-4 border-l-blue-600'
                      : 'text-gray-700 hover:bg-gray-50 border-l-4 border-l-transparent'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${activeSection === item.id ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div className='flex-1'>
                    <div className='font-medium'>{item.label}</div>
                    <div className='text-xs text-gray-500 mt-0.5 hidden sm:block'>{item.description}</div>
                  </div>
                  <HiChevronRight className={`w-4 h-4 ${activeSection === item.id ? 'text-blue-600' : 'text-gray-300'}`} />
                </button>
              ))}
            </nav>

            {/* Account Info Card */}
            <div className='mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-4'>
              <div className='flex items-center gap-3'>
                <img
                  src={currentUser?.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
                  alt='avatar'
                  className='w-12 h-12 rounded-full object-cover'
                />
                <div className='flex-1 min-w-0'>
                  <div className='font-medium text-gray-900 truncate'>{currentUser?.username}</div>
                  <div className='text-sm text-gray-500 truncate'>{currentUser?.email}</div>
                </div>
              </div>
              <div className='mt-4 pt-4 border-t border-gray-100'>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                  currentUser?.role === 'admin' ? 'bg-red-100 text-red-800' :
                  currentUser?.role === 'employee' ? 'bg-blue-100 text-blue-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {currentUser?.role === 'admin' ? 'Admin' : currentUser?.role === 'employee' ? 'Employee' : 'User'}
                </span>
              </div>
            </div>
          </div>

          {/* Settings Content */}
          <div className='lg:col-span-3'>
            {/* Notifications Section */}
            {activeSection === 'notifications' && (
              <div className='space-y-6'>
                <div className='bg-white rounded-xl shadow-sm border border-gray-200 p-6'>
                  <div className='flex items-center gap-3 mb-6'>
                    <div className='p-2 bg-blue-100 rounded-lg'>
                      <HiMail className='w-5 h-5 text-blue-600' />
                    </div>
                    <div>
                      <h2 className='text-lg font-semibold text-gray-900'>Email Notifications</h2>
                      <p className='text-sm text-gray-500'>Choose what emails you want to receive</p>
                    </div>
                  </div>
                  <div className='divide-y divide-gray-100'>
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

                <div className='bg-white rounded-xl shadow-sm border border-gray-200 p-6'>
                  <div className='flex items-center gap-3 mb-6'>
                    <div className='p-2 bg-purple-100 rounded-lg'>
                      <HiBell className='w-5 h-5 text-purple-600' />
                    </div>
                    <div>
                      <h2 className='text-lg font-semibold text-gray-900'>Push Notifications</h2>
                      <p className='text-sm text-gray-500'>Manage in-app notifications</p>
                    </div>
                  </div>
                  <div className='divide-y divide-gray-100'>
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

            {/* Privacy Section */}
            {activeSection === 'privacy' && (
              <div className='space-y-6'>
                <div className='bg-white rounded-xl shadow-sm border border-gray-200 p-6'>
                  <div className='flex items-center gap-3 mb-6'>
                    <div className='p-2 bg-green-100 rounded-lg'>
                      <HiEye className='w-5 h-5 text-green-600' />
                    </div>
                    <div>
                      <h2 className='text-lg font-semibold text-gray-900'>Profile Visibility</h2>
                      <p className='text-sm text-gray-500'>Control what others can see</p>
                    </div>
                  </div>
                  <div className='divide-y divide-gray-100'>
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

                <div className='bg-white rounded-xl shadow-sm border border-gray-200 p-6'>
                  <div className='flex items-center gap-3 mb-6'>
                    <div className='p-2 bg-indigo-100 rounded-lg'>
                      <HiGlobe className='w-5 h-5 text-indigo-600' />
                    </div>
                    <div>
                      <h2 className='text-lg font-semibold text-gray-900'>Communication</h2>
                      <p className='text-sm text-gray-500'>Manage who can contact you</p>
                    </div>
                  </div>
                  <div className='divide-y divide-gray-100'>
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

            {/* Security Section */}
            {activeSection === 'security' && (
              <div className='space-y-6'>
                <div className='bg-white rounded-xl shadow-sm border border-gray-200 p-6'>
                  <div className='flex items-center gap-3 mb-6'>
                    <div className='p-2 bg-red-100 rounded-lg'>
                      <HiLockClosed className='w-5 h-5 text-red-600' />
                    </div>
                    <div>
                      <h2 className='text-lg font-semibold text-gray-900'>Password & Authentication</h2>
                      <p className='text-sm text-gray-500'>Manage your account security</p>
                    </div>
                  </div>
                  <div className='space-y-4'>
                    <Link
                      to='/password-reset'
                      className='flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors'
                    >
                      <div className='flex items-center gap-3'>
                        <HiLockClosed className='w-5 h-5 text-gray-400' />
                        <div>
                          <div className='font-medium text-gray-900'>Change Password</div>
                          <div className='text-sm text-gray-500'>Update your password regularly for security</div>
                        </div>
                      </div>
                      <HiChevronRight className='w-5 h-5 text-gray-400' />
                    </Link>
                  </div>
                </div>

                <div className='bg-white rounded-xl shadow-sm border border-gray-200 p-6'>
                  <div className='flex items-center gap-3 mb-6'>
                    <div className='p-2 bg-orange-100 rounded-lg'>
                      <HiDeviceMobile className='w-5 h-5 text-orange-600' />
                    </div>
                    <div>
                      <h2 className='text-lg font-semibold text-gray-900'>Active Sessions</h2>
                      <p className='text-sm text-gray-500'>Manage devices where you&apos;re logged in</p>
                    </div>
                  </div>
                  <div className='space-y-3'>
                    <div className='flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg'>
                      <div className='flex items-center gap-3'>
                        <div className='p-2 bg-green-100 rounded-lg'>
                          <HiDeviceMobile className='w-5 h-5 text-green-600' />
                        </div>
                        <div>
                          <div className='font-medium text-gray-900'>Current Device</div>
                          <div className='text-sm text-gray-500'>This device • Active now</div>
                        </div>
                      </div>
                      <span className='px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium'>
                        Active
                      </span>
                    </div>
                    <button
                      onClick={handleSignOutAllDevices}
                      className='w-full flex items-center justify-center gap-2 p-3 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors font-medium'
                    >
                      <HiLogout className='w-5 h-5' />
                      Sign Out All Devices
                    </button>
                  </div>
                </div>

                <div className='bg-white rounded-xl shadow-sm border border-red-200 p-6'>
                  <div className='flex items-center gap-3 mb-4'>
                    <div className='p-2 bg-red-100 rounded-lg'>
                      <HiExclamation className='w-5 h-5 text-red-600' />
                    </div>
                    <div>
                      <h2 className='text-lg font-semibold text-red-600'>Danger Zone</h2>
                      <p className='text-sm text-gray-500'>Irreversible actions</p>
                    </div>
                  </div>
                  <div className='space-y-3'>
                    <Link
                      to='/profile'
                      className='flex items-center justify-between p-4 border border-red-200 rounded-lg hover:bg-red-50 transition-colors'
                    >
                      <div>
                        <div className='font-medium text-red-600'>Delete Account</div>
                        <div className='text-sm text-gray-500'>Permanently delete your account and data</div>
                      </div>
                      <HiChevronRight className='w-5 h-5 text-red-400' />
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Appearance Section */}
            {activeSection === 'appearance' && (
              <div className='space-y-6'>
                <div className='bg-white rounded-xl shadow-sm border border-gray-200 p-6'>
                  <div className='flex items-center gap-3 mb-6'>
                    <div className='p-2 bg-pink-100 rounded-lg'>
                      <HiColorSwatch className='w-5 h-5 text-pink-600' />
                    </div>
                    <div>
                      <h2 className='text-lg font-semibold text-gray-900'>Display</h2>
                      <p className='text-sm text-gray-500'>Customize how the app looks</p>
                    </div>
                  </div>
                  <div className='divide-y divide-gray-100'>
                    <ToggleSwitch
                      enabled={compactMode}
                      onToggle={handleCompactModeToggle}
                      label='Compact Mode'
                      description='Reduce spacing for more content on screen'
                    />
                  </div>
                </div>

                <div className='bg-white rounded-xl shadow-sm border border-gray-200 p-6'>
                  <div className='flex items-center gap-3 mb-6'>
                    <div className='p-2 bg-gray-100 rounded-lg'>
                      <HiCog className='w-5 h-5 text-gray-600' />
                    </div>
                    <div>
                      <h2 className='text-lg font-semibold text-gray-900'>Theme</h2>
                      <p className='text-sm text-gray-500'>Choose your preferred theme</p>
                    </div>
                  </div>
                  <div className='grid grid-cols-3 gap-3'>
                    <button
                      type='button'
                      onClick={() => setTheme('light')}
                      className={`p-4 rounded-lg bg-white text-center transition-colors ${
                        themePreference === 'light'
                          ? 'border-2 border-blue-500'
                          : 'border border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className='w-8 h-8 mx-auto mb-2 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300'></div>
                      <span className='text-sm font-medium text-gray-900'>Light</span>
                    </button>
                    <button
                      type='button'
                      onClick={() => setTheme('dark')}
                      className={`p-4 rounded-lg bg-white text-center transition-colors ${
                        themePreference === 'dark'
                          ? 'border-2 border-blue-500'
                          : 'border border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className='w-8 h-8 mx-auto mb-2 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-gray-600'></div>
                      <span className='text-sm font-medium text-gray-900'>Dark</span>
                    </button>
                    <button
                      type='button'
                      onClick={() => setTheme('system')}
                      className={`p-4 rounded-lg bg-white text-center transition-colors ${
                        themePreference === 'system'
                          ? 'border-2 border-blue-500'
                          : 'border border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className='w-8 h-8 mx-auto mb-2 rounded-full bg-gradient-to-br from-gray-200 to-gray-700 border border-gray-400'></div>
                      <span className='text-sm font-medium text-gray-900'>System</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
