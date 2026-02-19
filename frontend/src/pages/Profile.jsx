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
import { apiClient, normalizeImageUrl } from '../utils/http';
import { useBuyerView } from '../contexts/BuyerViewContext';
import {
  HiX,
  HiCheck,
  HiEye,
  HiEyeOff,
  HiCog,
  HiLogout,
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
      const data = await apiClient.upload('/upload/single', form);
      if (!data.url) throw new Error(data?.message || 'Upload failed');
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

      const data = await apiClient.post('/auth/reset-password-with-otp', {
        email: currentUser.email,
        otp: passwordData.oldPassword, // Using old password as OTP for simplicity
        newPassword: passwordData.newPassword,
      });
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
      const data = await apiClient.post(`/user/update/${currentUser._id}`, payload);
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

      await apiClient.delete(`/user/delete/${currentUser._id}`);
      dispatch(deleteUserSuccess({ success: true }));
    } catch (error) {
      dispatch(deleteUserFailure(error.message));
    }
  };

  const handleSignOut = async () => {
    try {
      dispatch(signOutUserStart());
      await apiClient.get('/auth/signout');
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
      const data = await apiClient.get(`/user/listings/${currentUser._id}`);
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
      const data = await apiClient.delete(`/listing/delete/${listingId}`);
      if (data.success === false) return;

      // Trigger cache invalidation event
      window.dispatchEvent(new CustomEvent('listing-deleted', { detail: { id: listingId } }));

      setUserListings((prev) =>
        prev.filter((listing) => listing._id !== listingId)
      );
    } catch {
      // silently ignore
    }
  };
  // Role-based UI components
  const isAdmin = currentUser?.role === 'admin';
  const isEmployee = currentUser?.role === 'employee';
  const isUser = currentUser?.role === 'user';

  return (
    <div>
      {/* Toast Notification */}
      {showPopup && (
        <div className={`fixed top-5 right-5 z-[9999] flex items-start gap-3 bg-white border rounded-xl px-4 py-3.5 shadow-xl min-w-[300px] max-w-sm ${popupType === 'success' ? 'border-l-4 border-l-emerald-500 border-slate-200' : 'border-l-4 border-l-red-500 border-slate-200'
          }`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${popupType === 'success' ? 'bg-emerald-100' : 'bg-red-100'
            }`}>
            {popupType === 'success'
              ? <HiCheck className='w-3.5 h-3.5 text-emerald-600' />
              : <HiX className='w-3.5 h-3.5 text-red-600' />}
          </div>
          <p className={`flex-1 text-sm font-medium ${popupType === 'success' ? 'text-emerald-800' : 'text-red-800'}`}>
            {popupMessage}
          </p>
          <button onClick={() => setShowPopup(false)} className='text-slate-400 hover:text-slate-600 flex-shrink-0 p-0.5'>
            <HiX className='w-4 h-4' />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6'>
        <div className='flex items-center gap-3'>
          <h1 className='text-xl font-bold text-slate-900'>My Profile</h1>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${isAdmin ? 'bg-rose-100 text-rose-700' :
              isEmployee ? 'bg-indigo-100 text-indigo-700' :
                'bg-emerald-100 text-emerald-700'
            }`}>
            {isAdmin ? 'Admin' : isEmployee ? 'Employee' : 'User'}
          </span>
        </div>
        <div className='flex items-center gap-2'>
          <Link
            to='/settings'
            className='inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors'
          >
            <HiCog className='w-4 h-4' />
            Settings
          </Link>
          <button
            onClick={handleSignOut}
            className='inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-sm font-semibold transition-colors'
          >
            <HiLogout className='w-4 h-4' />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div>
        <div className='grid grid-cols-1 xl:grid-cols-3 gap-8'>
          {/* Left Column - Profile Picture & Quick Actions */}
          <div className='xl:col-span-1 space-y-6'>
            {/* Profile Picture Card */}
            <div className='bg-white rounded-2xl border border-slate-200 p-6'>
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
                  className='w-full bg-indigo-600 text-white py-2 px-4 rounded-xl hover:bg-indigo-700 transition-colors text-sm font-semibold'
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
            <div className='bg-white rounded-2xl border border-slate-200 p-6'>
              <h3 className='text-sm font-semibold text-slate-800 mb-4'>Quick Actions</h3>
              <div className='space-y-3'>
                {!isBuyerViewMode && (currentUser.role === 'admin' || currentUser.role === 'employee' || currentUser.role === 'seller') && (
                  <Link
                    to='/create-listing'
                    className='w-full bg-emerald-600 text-white py-2 px-4 rounded-xl hover:bg-emerald-700 transition-colors text-sm font-semibold text-center block'
                  >
                    Create New Listing
                  </Link>
                )}
                <button
                  onClick={handleShowListings}
                  className='w-full bg-slate-700 text-white py-2 px-4 rounded-xl hover:bg-slate-800 transition-colors text-sm font-semibold'
                >
                  View My Listings
                </button>
                {!isBuyerViewMode && isAdmin && (
                  <Link
                    to='/admin'
                    className='w-full bg-rose-600 text-white py-2 px-4 rounded-xl hover:bg-rose-700 transition-colors text-sm font-semibold text-center block'
                  >
                    Admin Dashboard
                  </Link>
                )}
                {!isBuyerViewMode && isEmployee && (
                  <Link
                    to='/admin'
                    className='w-full bg-indigo-600 text-white py-2 px-4 rounded-xl hover:bg-indigo-700 transition-colors text-sm font-semibold text-center block'
                  >
                    Employee Dashboard
                  </Link>
                )}
              </div>
            </div>

            {/* Password Change */}
            <div className='bg-white rounded-2xl border border-slate-200 p-6'>
              <h3 className='text-sm font-semibold text-slate-800 mb-4'>Change Password</h3>
              <form onSubmit={handlePasswordSubmit} className='space-y-4'>
                <div>
                  <label className='block text-sm font-medium text-slate-700 mb-1'>Current Password</label>
                  <div className='relative'>
                    <input
                      type={showPassword.old ? 'text' : 'password'}
                      id='oldPassword'
                      value={passwordData.oldPassword}
                      onChange={handlePasswordChange}
                      className='w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-slate-50 focus:bg-white transition-all'
                      placeholder='Enter current password'
                    />
                    <button
                      type='button'
                      onClick={() => setShowPassword({ ...showPassword, old: !showPassword.old })}
                      className='absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600'
                    >
                      {showPassword.old ? <HiEyeOff className='w-4 h-4' /> : <HiEye className='w-4 h-4' />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className='block text-sm font-medium text-slate-700 mb-1'>New Password</label>
                  <div className='relative'>
                    <input
                      type={showPassword.new ? 'text' : 'password'}
                      id='newPassword'
                      value={passwordData.newPassword}
                      onChange={handlePasswordChange}
                      className='w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-slate-50 focus:bg-white transition-all'
                      placeholder='Enter new password'
                    />
                    <button
                      type='button'
                      onClick={() => setShowPassword({ ...showPassword, new: !showPassword.new })}
                      className='absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600'
                    >
                      {showPassword.new ? <HiEyeOff className='w-4 h-4' /> : <HiEye className='w-4 h-4' />}
                    </button>
                  </div>
                </div>
                <button
                  type='submit'
                  className='w-full bg-indigo-600 text-white py-2 px-4 rounded-xl hover:bg-indigo-700 transition-colors text-sm font-semibold'
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
            <div className='bg-white rounded-lg shadow-sm border border-red-200 rounded-2xl p-6'>
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
                className='w-full py-2 px-4 text-sm font-medium text-red-600 border border-red-300 rounded-xl hover:bg-red-50 transition-colors'
              >
                Delete My Account
              </button>
            </div>
          </div>

          {/* Right Column - Profile Information */}
          <div className='xl:col-span-2'>
            <form onSubmit={handleSubmit} className='space-y-6'>
              {/* Basic Information */}
              <div className='bg-white rounded-2xl border border-slate-200 p-6'>
                <h3 className='text-sm font-semibold text-slate-800 mb-4'>Basic Information</h3>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div>
                    <label className='block text-sm font-medium text-slate-700 mb-2'>Username *</label>
                    <input
                      type='text'
                      id='username'
                      defaultValue={currentUser.username}
                      onChange={handleChange}
                      className='w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 focus:bg-white transition-all'
                      placeholder='Enter username'
                      required
                    />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-slate-700 mb-2'>Email *</label>
                    <input
                      type='email'
                      id='email'
                      defaultValue={currentUser.email}
                      className='w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-100 text-slate-400 cursor-not-allowed'
                      disabled
                    />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-slate-700 mb-2'>First Name</label>
                    <input
                      type='text'
                      id='firstName'
                      defaultValue={currentUser.firstName || ''}
                      onChange={handleChange}
                      className='w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 focus:bg-white transition-all'
                      placeholder='Enter first name'
                    />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-slate-700 mb-2'>Last Name</label>
                    <input
                      type='text'
                      id='lastName'
                      defaultValue={currentUser.lastName || ''}
                      onChange={handleChange}
                      className='w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 focus:bg-white transition-all'
                      placeholder='Enter last name'
                    />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-slate-700 mb-2'>Phone Number</label>
                    <input
                      type='tel'
                      id='phone'
                      value={phoneInput}
                      onChange={handleChange}
                      className='w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 focus:bg-white transition-all'
                      placeholder='+1 (555) 123-4567'
                    />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-slate-700 mb-2'>Role</label>
                    <select
                      id='role'
                      defaultValue={currentUser.role || 'user'}
                      onChange={handleChange}
                      className='w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 focus:bg-white transition-all'
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
              <div className='bg-white rounded-2xl border border-slate-200 p-6'>
                <h3 className='text-sm font-semibold text-slate-800 mb-4'>Address Information</h3>
                <div className='space-y-4'>
                  <div>
                    <label className='block text-sm font-medium text-slate-700 mb-2'>Address Line 1</label>
                    <input
                      type='text'
                      id='addressLine1'
                      defaultValue={currentUser.addressLine1 || ''}
                      onChange={handleChange}
                      className='w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 focus:bg-white transition-all'
                      placeholder='Enter address line 1'
                    />
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-slate-700 mb-2'>Address Line 2</label>
                    <input
                      type='text'
                      id='addressLine2'
                      defaultValue={currentUser.addressLine2 || ''}
                      onChange={handleChange}
                      className='w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 focus:bg-white transition-all'
                      placeholder='Enter address line 2'
                    />
                  </div>
                  <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-slate-700 mb-2'>City</label>
                      <input
                        type='text'
                        id='city'
                        defaultValue={currentUser.city || ''}
                        onChange={handleChange}
                        className='w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 focus:bg-white transition-all'
                        placeholder='Enter city'
                      />
                    </div>
                    <div>
                      <label className='block text-sm font-medium text-slate-700 mb-2'>State</label>
                      <input
                        type='text'
                        id='state'
                        defaultValue={currentUser.state || ''}
                        onChange={handleChange}
                        className='w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 focus:bg-white transition-all'
                        placeholder='Enter state'
                      />
                    </div>
                    <div>
                      <label className='block text-sm font-medium text-slate-700 mb-2'>Postal Code</label>
                      <input
                        type='text'
                        id='postalCode'
                        defaultValue={currentUser.postalCode || ''}
                        onChange={handleChange}
                        className='w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 focus:bg-white transition-all'
                        placeholder='Enter postal code'
                      />
                    </div>
                  </div>
                  <div>
                    <label className='block text-sm font-medium text-slate-700 mb-2'>Country</label>
                    <input
                      type='text'
                      id='country'
                      defaultValue={currentUser.country || ''}
                      onChange={handleChange}
                      className='w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 focus:bg-white transition-all'
                      placeholder='Enter country'
                    />
                  </div>
                </div>
              </div>

              {/* Bio Section */}
              <div className='bg-white rounded-2xl border border-slate-200 p-6'>
                <h3 className='text-sm font-semibold text-slate-800 mb-4'>About You</h3>
                <div>
                  <label className='block text-sm font-medium text-slate-700 mb-2'>Biography</label>
                  <textarea
                    id='bio'
                    defaultValue={currentUser.bio || ''}
                    onChange={handleChange}
                    rows={4}
                    className='w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 focus:bg-white transition-all'
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
                  className='px-8 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors font-semibold text-sm'
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
            <div className='bg-white rounded-2xl border border-slate-200 p-6'>
              <div className='flex justify-between items-center mb-6'>
                <h2 className='text-base font-semibold text-slate-900'>Your Listings</h2>
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
                    className='bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow'
                  >
                    <Link to={`/listing/${listing._id}`}>
                      <img
                        src={normalizeImageUrl(listing.imageUrls[0])}
                        alt='listing cover'
                        className='w-full h-48 object-cover'
                      />
                    </Link>
                    <div className='p-4'>
                      <Link
                        className='text-slate-900 font-semibold hover:text-indigo-600 transition-colors'
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
