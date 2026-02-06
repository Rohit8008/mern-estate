import { useSelector } from 'react-redux';
import { useRef, useState, useEffect } from 'react';
import {
  updateUserStart,
  updateUserSuccess,
  updateUserFailure,
  deleteUserFailure,
  deleteUserStart,
  deleteUserSuccess,
  signOutUserStart,
  signOutUserSuccess,
  signOutUserFailure,
} from '../redux/user/userSlice';
import { useDispatch } from 'react-redux';
import { Link } from 'react-router-dom';
import { parseJsonSafely, fetchWithRefresh } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';
import {
  HiX,
  HiCheck,
  HiEye,
  HiEyeOff
} from 'react-icons/hi';
export default function Profile() {
  const fileRef = useRef(null);
  const { currentUser, loading, error } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();
  const [file, setFile] = useState(undefined);
  const [filePerc, setFilePerc] = useState(0);
  const [fileUploadError, setFileUploadError] = useState(false);
  const [formData, setFormData] = useState({});
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [showListingsError, setShowListingsError] = useState(false);
  const [userListings, setUserListings] = useState([]);
  const [phoneInput, setPhoneInput] = useState((currentUser?.phone) || '');
  const [showPassword, setShowPassword] = useState({ old: false, new: false });
  const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');
  const [popupType, setPopupType] = useState('success'); // 'success' or 'error'
  const dispatch = useDispatch();

  // Function to show popup
  const showNotification = (message, type = 'success') => {
    console.log('Showing popup:', message, type); // Debug log
    setPopupMessage(message);
    setPopupType(type);
    setShowPopup(true);
    
    setTimeout(() => {
      setShowPopup(false);
    }, 4000);
  };


  useEffect(() => {
    if (file) {
      handleFileUpload(file);
    }
  }, [file]);

  const handleFileUpload = async (file) => {
    try {
      setFileUploadError(false);
      setFilePerc(10);
      const form = new FormData();
      form.append('image', file);
      const res = await fetch('/api/upload/single', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await parseJsonSafely(res);
      if (!res.ok || !data.url) throw new Error(data?.message || 'Upload failed');
      setFormData({ ...formData, avatar: data.url });
      setFilePerc(100);
    } catch (e) {
      setFileUploadError(true);
      setFilePerc(0);
    }
  };

  const handleChange = (e) => {
    if (e.target.id === 'phone') {
      setPhoneInput(e.target.value);
      setFormData({ ...formData, phone: e.target.value });
      return;
    }
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handlePasswordChange = (e) => {
    setPasswordData({ ...passwordData, [e.target.id]: e.target.value });
    setPasswordError('');
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    try {
      setPasswordError('');
      setPasswordSuccess(false);
      
      const res = await fetch('/api/auth/reset-password-with-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: currentUser.email,
          otp: passwordData.oldPassword, // Using old password as OTP for simplicity
          newPassword: passwordData.newPassword,
        }),
      });
      
      const data = await parseJsonSafely(res);
      if (data.success === false) {
        setPasswordError(data.message || 'Password change failed');
        showNotification(data.message || 'Password change failed', 'error');
        return;
      }
      
      setPasswordSuccess(true);
      setPasswordData({ oldPassword: '', newPassword: '' });
      showNotification('Password changed successfully!', 'success');
    } catch (error) {
      setPasswordError('Password change failed. Please try again.');
      showNotification('Password change failed. Please try again.', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      dispatch(updateUserStart());
      const payload = { ...formData };
      const res = await fetch(`/api/user/update/${currentUser._id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await parseJsonSafely(res);
      if (data.success === false) {
        dispatch(updateUserFailure(data.message));
        showNotification(data.message || 'Failed to update profile', 'error');
        return;
      }

      dispatch(updateUserSuccess(data));
      setUpdateSuccess(true);
      showNotification('Profile updated successfully!', 'success');
    } catch (error) {
      dispatch(updateUserFailure(error.message));
      showNotification(error.message || 'Failed to update profile', 'error');
    }
  };

  

  const handleDeleteUser = async () => {
    try {
      dispatch(deleteUserStart());
      
      const res = await fetch(`/api/user/delete/${currentUser._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await parseJsonSafely(res);
      if (data.success === false) {
        dispatch(deleteUserFailure(data.message));
        return;
      }
      dispatch(deleteUserSuccess(data));
    } catch (error) {
      dispatch(deleteUserFailure(error.message));
    }
  };

  const handleSignOut = async () => {
    try {
      dispatch(signOutUserStart());
      const res = await fetch('/api/auth/signout', {
        method: 'GET',
        credentials: 'include',
      });
      const data = await parseJsonSafely(res);
      if (data.success === false) {
        dispatch(signOutUserFailure(data.message));
        return;
      }
      dispatch(signOutUserSuccess());
      
      // Clear any stored data
      localStorage.removeItem('persist:root');
      sessionStorage.clear();
      
      // Navigate to home
      window.location.href = '/';
    } catch (error) {
      dispatch(signOutUserFailure(error.message));
      // Even if API call fails, clear local state
      dispatch(signOutUserSuccess());
      localStorage.removeItem('persist:root');
      sessionStorage.clear();
      window.location.href = '/';
    }
  };

  const handleShowListings = async () => {
    try {
      setShowListingsError(false);
      const res = await fetchWithRefresh(`/api/user/listings/${currentUser._id}`);
      const data = await parseJsonSafely(res);
      if (data.success === false) {
        setShowListingsError(true);
        return;
      }

      setUserListings(data);
    } catch (error) {
      setShowListingsError(true);
    }
  };

  const handleListingDelete = async (listingId) => {
    try {
      const res = await fetch(`/api/listing/delete/${listingId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await parseJsonSafely(res);
      if (data.success === false) {
        console.log(data.message);
        return;
      }

      // Trigger cache invalidation event
      window.dispatchEvent(new CustomEvent('listing-deleted', { detail: { id: listingId } }));

      setUserListings((prev) =>
        prev.filter((listing) => listing._id !== listingId)
      );
    } catch (error) {
      console.log(error.message);
    }
  };
  // Role-based UI components
  const isAdmin = currentUser?.role === 'admin';
  const isEmployee = currentUser?.role === 'employee';
  const isUser = currentUser?.role === 'user';

  // Debug popup state
  console.log('Popup state:', showPopup, popupMessage, popupType);

  return (
    <div className='min-h-screen bg-gray-50'>
      {/* Simple Popup Notification */}
      {showPopup && (
        <div 
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '16px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            borderLeft: `4px solid ${popupType === 'success' ? '#10b981' : '#ef4444'}`,
            maxWidth: '400px',
            minWidth: '300px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div style={{ marginRight: '12px', flexShrink: 0 }}>
              {popupType === 'success' ? (
                <div style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: '#dcfce7',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <HiCheck style={{ width: '16px', height: '16px', color: '#16a34a' }} />
                </div>
              ) : (
                <div style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: '#fecaca',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <HiX style={{ width: '16px', height: '16px', color: '#dc2626' }} />
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: '500',
                color: popupType === 'success' ? '#166534' : '#991b1b'
              }}>
                {popupMessage}
              </p>
            </div>
            <div style={{ marginLeft: '16px', flexShrink: 0 }}>
              <button
                onClick={() => setShowPopup(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9ca3af',
                  padding: '4px'
                }}
              >
                <HiX style={{ width: '20px', height: '20px' }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className='bg-white shadow-sm border-b border-gray-200'>
        <div className='max-w-6xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex justify-between items-center py-6'>
            <div>
              <h1 className='text-2xl font-bold text-gray-900'>Profile Settings</h1>
              <p className='text-sm text-gray-600 mt-1'>
                Manage your account settings and preferences
              </p>
            </div>
            <div className='flex items-center space-x-3'>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                isAdmin ? 'bg-red-100 text-red-800' :
                isEmployee ? 'bg-blue-100 text-blue-800' :
                'bg-green-100 text-green-800'
              }`}>
                {isAdmin ? 'Admin' : isEmployee ? 'Employee' : 'User'}
              </span>
              <button
                onClick={handleSignOut}
                className='px-4 py-2 text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors'
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className='max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
        <div className='grid grid-cols-1 xl:grid-cols-3 gap-8'>
          {/* Left Column - Profile Picture & Quick Actions */}
          <div className='xl:col-span-1 space-y-6'>
            {/* Profile Picture Card */}
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
              <div className='flex flex-col items-center'>
                <div className='relative mb-4'>
                  <img
                    onClick={() => fileRef.current.click()}
                    src={formData.avatar || currentUser.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
                    alt='profile'
                    className='w-24 h-24 rounded-full object-cover cursor-pointer border-4 border-gray-200 hover:border-blue-300 transition-colors'
                    onError={(e) => { e.currentTarget.src = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'; }}
                  />
                  <button
                    onClick={() => setFormData({ ...formData, avatar: 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png' })}
                    className='absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors'
                  >
                    <HiX className='w-3 h-3' />
                  </button>
                </div>
        <input
          onChange={(e) => setFile(e.target.files[0])}
          type='file'
          ref={fileRef}
          hidden
          accept='image/*'
        />
                <button
          onClick={() => fileRef.current.click()}
                  className='w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium'
                >
                  Change Photo
                </button>
                {fileUploadError && (
                  <p className='text-red-600 text-xs text-center mt-2'>
                    Error uploading image (must be less than 2MB)
                  </p>
                )}
                {filePerc > 0 && filePerc < 100 && (
                  <p className='text-blue-600 text-xs text-center mt-2'>
                    Uploading {filePerc}%
                  </p>
                )}
                {filePerc === 100 && (
                  <p className='text-green-600 text-xs text-center mt-2'>
                    Image uploaded successfully!
                  </p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
              <h3 className='text-lg font-semibold text-gray-900 mb-4'>Quick Actions</h3>
              <div className='space-y-3'>
                {!isBuyerViewMode && (currentUser.role === 'admin' || currentUser.role === 'employee' || currentUser.role === 'seller') && (
                  <Link
                    to='/create-listing'
                    className='w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium text-center block'
                  >
                    Create New Listing
                  </Link>
                )}
                <button
                  onClick={handleShowListings}
                  className='w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium'
                >
                  View My Listings
                </button>
                {!isBuyerViewMode && isAdmin && (
                  <Link
                    to='/admin'
                    className='w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium text-center block'
                  >
                    Admin Dashboard
                  </Link>
                )}
                {!isBuyerViewMode && isEmployee && (
                  <Link
                    to='/admin'
                    className='w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium text-center block'
                  >
                    Employee Dashboard
                  </Link>
                )}
              </div>
            </div>

            {/* Password Change */}
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
              <h3 className='text-lg font-semibold text-gray-900 mb-4'>Change Password</h3>
              <form onSubmit={handlePasswordSubmit} className='space-y-4'>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-1'>Current Password</label>
                  <div className='relative'>
                    <input
                      type={showPassword.old ? 'text' : 'password'}
                      id='oldPassword'
                      value={passwordData.oldPassword}
                      onChange={handlePasswordChange}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm'
                      placeholder='Enter current password'
                    />
                    <button
                      type='button'
                      onClick={() => setShowPassword({ ...showPassword, old: !showPassword.old })}
                      className='absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600'
                    >
                      {showPassword.old ? <HiEyeOff className='w-4 h-4' /> : <HiEye className='w-4 h-4' />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-1'>New Password</label>
                  <div className='relative'>
                    <input
                      type={showPassword.new ? 'text' : 'password'}
                      id='newPassword'
                      value={passwordData.newPassword}
                      onChange={handlePasswordChange}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm'
                      placeholder='Enter new password'
                    />
          <button
            type='button'
                      onClick={() => setShowPassword({ ...showPassword, new: !showPassword.new })}
                      className='absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600'
          >
                      {showPassword.new ? <HiEyeOff className='w-4 h-4' /> : <HiEye className='w-4 h-4' />}
          </button>
        </div>
                </div>
                <button
                  type='submit'
                  className='w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium'
                >
                  Update Password
                </button>
                {passwordError && (
                  <p className='text-red-600 text-xs'>{passwordError}</p>
                )}
                {passwordSuccess && (
                  <p className='text-green-600 text-xs'>Password changed successfully!</p>
                )}
              </form>
            </div>

            {/* Danger Zone */}
            <div className='bg-white rounded-lg shadow-sm border border-red-200 p-6'>
              <h3 className='text-lg font-semibold text-red-600 mb-2'>Danger Zone</h3>
              <p className='text-sm text-gray-500 mb-4'>
                Once you delete your account, there is no going back. All your data will be permanently removed.
              </p>
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
                    handleDeleteUser();
                  }
                }}
                className='w-full py-2 px-4 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors'
              >
                Delete My Account
              </button>
            </div>
          </div>

          {/* Right Column - Profile Information */}
          <div className='xl:col-span-2'>
            <form onSubmit={handleSubmit} className='space-y-6'>
              {/* Basic Information */}
              <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
                <h3 className='text-lg font-semibold text-gray-900 mb-4'>Basic Information</h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>Username *</label>
          <input
            type='text'
                      id='username'
            defaultValue={currentUser.username}
            onChange={handleChange}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                      placeholder='Enter username'
                      required
          />
        </div>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>Email *</label>
        <input
          type='email'
          id='email'
          defaultValue={currentUser.email}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed'
          disabled
        />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>First Name</label>
                    <input
                      type='text'
                      id='firstName'
                      defaultValue={currentUser.firstName || ''}
                      onChange={handleChange}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                      placeholder='Enter first name'
                    />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>Last Name</label>
                    <input
                      type='text'
                      id='lastName'
                      defaultValue={currentUser.lastName || ''}
                      onChange={handleChange}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                      placeholder='Enter last name'
                    />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>Phone Number</label>
                    <input
                      type='tel'
                      id='phone'
                      value={phoneInput}
                      onChange={handleChange}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                      placeholder='+1 (555) 123-4567'
                    />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>Role</label>
                    <select
                      id='role'
                      defaultValue={currentUser.role || 'user'}
                      onChange={handleChange}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                      disabled={true}
                    >
                      <option value='user'>User</option>
                      <option value='employee'>Employee</option>
                      <option value='admin'>Admin</option>
                    </select>
                    <p className='text-xs text-gray-500 mt-1'>
                      {isAdmin ? 'Admins cannot change their own role' : 'Only admins can change roles'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Address Information */}
              <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
                <h3 className='text-lg font-semibold text-gray-900 mb-4'>Address Information</h3>
                <div className='space-y-4'>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>Address Line 1</label>
          <input
            type='text'
                      id='addressLine1'
            defaultValue={currentUser.addressLine1 || ''}
            onChange={handleChange}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                      placeholder='Enter address line 1'
          />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>Address Line 2</label>
          <input
            type='text'
                      id='addressLine2'
            defaultValue={currentUser.addressLine2 || ''}
            onChange={handleChange}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                      placeholder='Enter address line 2'
          />
                  </div>
                  <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>City</label>
          <input
            type='text'
                        id='city'
            defaultValue={currentUser.city || ''}
            onChange={handleChange}
                        className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                        placeholder='Enter city'
          />
                    </div>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>State</label>
          <input
            type='text'
                        id='state'
            defaultValue={currentUser.state || ''}
            onChange={handleChange}
                        className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                        placeholder='Enter state'
          />
                    </div>
                    <div>
                      <label className='block text-sm font-medium text-gray-700 mb-2'>Postal Code</label>
          <input
            type='text'
                        id='postalCode'
            defaultValue={currentUser.postalCode || ''}
            onChange={handleChange}
                        className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                        placeholder='Enter postal code'
          />
                    </div>
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-gray-700 mb-2'>Country</label>
          <input
            type='text'
                      id='country'
            defaultValue={currentUser.country || ''}
            onChange={handleChange}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                      placeholder='Enter country'
          />
                  </div>
                </div>
        </div>
        
              {/* Bio Section */}
              <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
                <h3 className='text-lg font-semibold text-gray-900 mb-4'>About You</h3>
                <div>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>Biography</label>
        <textarea
                    id='bio'
          defaultValue={currentUser.bio || ''}
          onChange={handleChange}
                    rows={4}
                    className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                    placeholder='Tell us about yourself...'
          maxLength={500}
        />
                  <p className='text-sm text-gray-500 mt-1'>
                    {currentUser.bio?.length || 0}/500 characters
                  </p>
                </div>
              </div>

              {/* Save Button */}
              <div className='flex justify-end'>
        <button
                  type='submit'
          disabled={loading}
                  className='px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium'
        >
                  {loading ? 'Saving...' : 'Save Changes'}
        </button>
              </div>
      </form>
          </div>
        </div>


        {/* Listings Section */}
        {userListings && userListings.length > 0 && (
          <div className='mt-8'>
            <div className='bg-white rounded-lg shadow-sm border border-gray-200 p-6'>
              <div className='flex justify-between items-center mb-6'>
                <h2 className='text-xl font-semibold text-gray-900'>Your Listings</h2>
                <button
                  onClick={handleShowListings}
                  className='text-blue-600 hover:text-blue-700 font-medium text-sm'
                >
                  Refresh Listings
                </button>
      </div>

              {showListingsError && (
                <p className='text-red-600 mb-4'>Error loading listings</p>
              )}

              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
          {userListings.map((listing) => (
            <div
              key={listing._id}
                    className='bg-gray-50 rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow'
            >
              <Link to={`/listing/${listing._id}`}>
                <img
                  src={listing.imageUrls[0]}
                  alt='listing cover'
                        className='w-full h-48 object-cover'
                />
              </Link>
                    <div className='p-4'>
              <Link
                        className='text-gray-900 font-semibold hover:text-blue-600 transition-colors'
                to={`/listing/${listing._id}`}
              >
                        <h3 className='truncate'>{listing.name}</h3>
                      </Link>
                      <div className='flex justify-between items-center mt-3'>
                        <span className='text-lg font-bold text-blue-600'>
                          ${listing.regularPrice?.toLocaleString()}
                        </span>
                        <div className='flex space-x-2'>
                          {!isBuyerViewMode && (currentUser.role === 'admin' || 
                            currentUser.role === 'employee' || 
                            (currentUser.role === 'seller' && listing.userRef === currentUser._id)) && (
                            <>
                              <Link to={`/update-listing/${listing._id}`}>
                                <button className='text-blue-600 hover:text-blue-700 text-sm font-medium'>
                                  Edit
                                </button>
                              </Link>
                              <button
                                onClick={() => handleListingDelete(listing._id)}
                                className='text-red-600 hover:text-red-700 text-sm font-medium'
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
        </div>
      )}
      </div>
    </div>
  );
}
