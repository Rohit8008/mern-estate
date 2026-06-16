import { useSelector, useDispatch } from 'react-redux';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiX, HiCheck, HiEye, HiEyeOff, HiCog, HiLogout, HiCamera,
} from 'react-icons/hi';
import ConfirmDialog from '../components/ConfirmDialog';
import CameraCapture from '../components/CameraCapture';
import {
  updateUserStart, updateUserSuccess, updateUserFailure,
  deleteUserFailure, deleteUserStart, deleteUserSuccess,
  signOutUserStart, signOutUserSuccess, signOutUserFailure,
} from '../redux/user/userSlice';
import { apiClient, normalizeImageUrl, setUserSignedOut } from '../utils/http';
import { uploadToCloudinary } from '../utils/cloudinary';
import { useBuyerView } from '../contexts/BuyerViewContext';
import {
  PageHeader, Button,
  Card, CardHeader, CardTitle,
  Input, Select, Textarea,
} from '../design-system';

const INPUT_CLS =
  'w-full border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white pl-3 pr-9 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400';

export default function Profile() {
  const fileRef = useRef(null);
  const { currentUser, loading, error } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();
  const dispatch = useDispatch();

  const [file, setFile] = useState(undefined);
  const [filePerc, setFilePerc] = useState(0);
  const [fileUploadError, setFileUploadError] = useState(false);
  const [formData, setFormData] = useState({});
  const [phoneInput, setPhoneInput] = useState(currentUser?.phone || '');
  const [showPassword, setShowPassword] = useState({ old: false, new: false });
  const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [pendingDeleteAccount, setPendingDeleteAccount] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [userListings, setUserListings] = useState([]);
  const [showListingsError, setShowListingsError] = useState(false);
  const [listingsLoaded, setListingsLoaded] = useState(false);
  const [listingsLoading, setListingsLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const isAdmin = currentUser?.role === 'admin';
  const isEmployee = currentUser?.role === 'employee';

  // File upload
  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    uploadFile(f);
  };

  const uploadFile = async (f) => {
    setFileUploadError(false);
    setFilePerc(0);

    let avatarUrl;
    try {
      avatarUrl = await uploadToCloudinary(f, {
        folder: 'avatars',
        onProgress: (p) => setFilePerc(Math.round(p * 0.9)),
      });
    } catch (err) {
      console.error('Cloudinary upload error:', err.message);
      setFileUploadError(true);
      setFilePerc(0);
      return;
    }

    // Persist whichever URL we got
    try {
      const updated = await apiClient.post(
        `/user/update/${currentUser._id}`,
        { avatar: avatarUrl },
        { silent: true }
      );
      setFormData((prev) => ({ ...prev, avatar: avatarUrl }));
      dispatch(updateUserSuccess(updated));
      setFilePerc(100);
    } catch {
      setFileUploadError(true);
      setFilePerc(0);
    }
  };

  const handleChange = (e) => {
    if (e.target.id === 'phone') {
      setPhoneInput(e.target.value);
      setFormData((prev) => ({ ...prev, phone: e.target.value }));
      return;
    }
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      dispatch(updateUserStart());
      const data = await apiClient.post(`/user/update/${currentUser._id}`, formData);
      if (data.success === false) {
        dispatch(updateUserFailure(data.message));
        showToast(data.message || 'Failed to update profile', 'error');
        return;
      }
      dispatch(updateUserSuccess(data));
      showToast('Profile updated successfully!');
    } catch (err) {
      dispatch(updateUserFailure(err.message));
      showToast(err.message || 'Failed to update profile', 'error');
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    try {
      setPasswordError('');
      setPasswordSuccess(false);
      const data = await apiClient.post('/user/password/reset', {
        email: currentUser.email,
        otp: passwordData.oldPassword,
        newPassword: passwordData.newPassword,
      }, { silent: true });
      if (data.success === false) {
        setPasswordError(data.message || 'Password change failed');
        showToast(data.message || 'Password change failed', 'error');
        return;
      }
      setPasswordSuccess(true);
      setPasswordData({ oldPassword: '', newPassword: '' });
      showToast('Password changed successfully!');
    } catch {
      setPasswordError('Password change failed. Please try again.');
      showToast('Password change failed. Please try again.', 'error');
    }
  };

  const handleDeleteUser = async () => {
    try {
      dispatch(deleteUserStart());
      await apiClient.delete(`/user/delete/${currentUser._id}`);
      dispatch(deleteUserSuccess({ success: true }));
    } catch (err) {
      dispatch(deleteUserFailure(err.message));
    }
  };

  const handleSignOut = async () => {
    setUserSignedOut(true);
    try {
      dispatch(signOutUserStart());
      await apiClient.post('/auth/signout');
      dispatch(signOutUserSuccess());
    } catch {
      dispatch(signOutUserSuccess());
    } finally {
      localStorage.removeItem('persist:root');
      sessionStorage.clear();
      window.location.href = '/';
    }
  };

  const handleShowListings = async () => {
    try {
      setShowListingsError(false);
      setListingsLoading(true);
      const data = await apiClient.get(`/user/listings/${currentUser._id}`);
      if (data.success === false) { setShowListingsError(true); return; }
      setUserListings(data);
      setListingsLoaded(true);
    } catch (err) {
      console.error('Listings fetch error:', err.message);
      setShowListingsError(true);
    } finally {
      setListingsLoading(false);
    }
  };

  const handleListingDelete = async (listingId) => {
    try {
      const data = await apiClient.delete(`/listing/delete/${listingId}`);
      if (data.success === false) return;
      window.dispatchEvent(new CustomEvent('listing-deleted', { detail: { id: listingId } }));
      setUserListings((prev) => prev.filter((l) => l._id !== listingId));
    } catch {
      // ignore
    }
  };

  return (
    <div className='space-y-6'>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[9999] flex items-start gap-3 bg-white border rounded-xl px-4 py-3.5 shadow-xl min-w-[300px] max-w-sm ${toast.type === 'success' ? 'border-l-4 border-l-emerald-500 border-slate-200' : 'border-l-4 border-l-rose-500 border-slate-200'}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${toast.type === 'success' ? 'bg-emerald-100' : 'bg-rose-100'}`}>
            {toast.type === 'success'
              ? <HiCheck className='w-3.5 h-3.5 text-emerald-600' />
              : <HiX className='w-3.5 h-3.5 text-rose-600' />}
          </div>
          <p className={`flex-1 text-sm font-medium ${toast.type === 'success' ? 'text-emerald-800' : 'text-rose-800'}`}>
            {toast.message}
          </p>
          <button onClick={() => setToast(null)} className='text-slate-400 hover:text-slate-600 flex-shrink-0 p-0.5'>
            <HiX className='w-4 h-4' />
          </button>
        </div>
      )}

      {/* Header */}
      <PageHeader
        title='My Profile'
        description='Manage your personal information and account settings'
        actions={
          <div className='flex items-center gap-2'>
            <Link
              to='/settings'
              className='inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-700 transition-colors'
            >
              <HiCog className='w-4 h-4' />
              Settings
            </Link>
            <Button icon={HiLogout} onClick={handleSignOut}>Sign Out</Button>
          </div>
        }
      />

      {/* Layout */}
      <div className='grid grid-cols-1 xl:grid-cols-3 gap-6'>
        {/* Left column */}
        <div className='xl:col-span-1 space-y-5'>
          {/* Photo */}
          <Card>
            <CardHeader><CardTitle>Profile Photo</CardTitle></CardHeader>
            <div className='flex flex-col items-center gap-3'>
              <div className='relative'>
                <img
                  onClick={() => fileRef.current.click()}
                  src={formData.avatar || currentUser.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
                  alt='profile'
                  className='w-24 h-24 rounded-full object-cover cursor-pointer border-4 border-slate-200 hover:border-indigo-300 transition-colors'
                  onError={(e) => { e.currentTarget.src = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'; }}
                />
                <button
                  type='button'
                  onClick={() => setFormData((prev) => ({ ...prev, avatar: 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png' }))}
                  className='absolute -top-1 -right-1 bg-rose-500 text-white rounded-full p-1 hover:bg-rose-600 transition-colors'
                >
                  <HiX className='w-3 h-3' />
                </button>
              </div>
              <input onChange={handleFileChange} type='file' ref={fileRef} hidden accept='image/*' />
              <Button variant='secondary' className='w-full justify-center' onClick={() => fileRef.current.click()}>
                Change Photo
              </Button>
              <Button variant='secondary' icon={HiCamera} className='w-full justify-center' onClick={() => setCameraOpen(true)}>
                Take Photo
              </Button>
              <CameraCapture
                open={cameraOpen}
                onClose={() => setCameraOpen(false)}
                onCapture={(file) => { setCameraOpen(false); uploadFile(file); }}
              />
              {fileUploadError && (
                <p className='text-rose-600 text-xs text-center'>Error uploading (must be less than 10MB)</p>
              )}
              {filePerc > 0 && filePerc < 100 && (
                <p className='text-indigo-600 text-xs text-center'>Uploading {filePerc}%</p>
              )}
              {filePerc === 100 && (
                <p className='text-emerald-600 text-xs text-center'>Uploaded successfully!</p>
              )}
            </div>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
            <div className='space-y-2'>
              {!isBuyerViewMode && (currentUser.role === 'admin' || currentUser.role === 'employee' || currentUser.role === 'seller') && (
                <Link to='/create-listing' className='block'>
                  <Button variant='primary' className='w-full justify-center'>
                    Create New Listing
                  </Button>
                </Link>
              )}
              <Button variant='secondary' className='w-full justify-center' onClick={handleShowListings} disabled={listingsLoading}>
                {listingsLoading ? 'Loading...' : 'View My Listings'}
              </Button>
              {!isBuyerViewMode && (isAdmin || isEmployee) && (
                <Link to='/admin' className='block'>
                  <Button variant='secondary' className='w-full justify-center'>
                    {isAdmin ? 'Admin Panel' : 'Employee Panel'}
                  </Button>
                </Link>
              )}
            </div>
          </Card>

          {/* Change Password */}
          <Card>
            <CardHeader><CardTitle>Change Password</CardTitle></CardHeader>
            <form onSubmit={handlePasswordSubmit} className='space-y-4'>
              <div>
                <label className='block text-sm font-medium text-slate-700 mb-1'>Current Password</label>
                <div className='relative'>
                  <input
                    type={showPassword.old ? 'text' : 'password'}
                    id='oldPassword'
                    value={passwordData.oldPassword}
                    onChange={(e) => { setPasswordData((p) => ({ ...p, oldPassword: e.target.value })); setPasswordError(''); }}
                    className={INPUT_CLS}
                    placeholder='Enter current password'
                  />
                  <button
                    type='button'
                    onClick={() => setShowPassword((p) => ({ ...p, old: !p.old }))}
                    className='absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600'
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
                    onChange={(e) => { setPasswordData((p) => ({ ...p, newPassword: e.target.value })); setPasswordError(''); }}
                    className={INPUT_CLS}
                    placeholder='Enter new password'
                  />
                  <button
                    type='button'
                    onClick={() => setShowPassword((p) => ({ ...p, new: !p.new }))}
                    className='absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600'
                  >
                    {showPassword.new ? <HiEyeOff className='w-4 h-4' /> : <HiEye className='w-4 h-4' />}
                  </button>
                </div>
              </div>
              {passwordError && <p className='text-rose-600 text-xs'>{passwordError}</p>}
              {passwordSuccess && <p className='text-emerald-600 text-xs'>Password changed successfully!</p>}
              <Button type='submit' variant='primary' className='w-full justify-center'>
                Update Password
              </Button>
            </form>
          </Card>

          {/* Danger Zone */}
          <Card className='border-rose-200'>
            <CardHeader><CardTitle className='text-rose-600'>Danger Zone</CardTitle></CardHeader>
            <p className='text-sm text-slate-500 mb-4'>
              Deleting your account is permanent and cannot be undone.
            </p>
            <button
              type='button'
              onClick={() => setPendingDeleteAccount(true)}
              className='w-full py-2 px-4 text-sm font-medium text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors'
            >
              Delete My Account
            </button>
            <ConfirmDialog
              open={pendingDeleteAccount}
              title='Delete your account?'
              description='This action cannot be undone. All your data will be permanently removed.'
              confirmLabel='Delete Account'
              onConfirm={() => { handleDeleteUser(); setPendingDeleteAccount(false); }}
              onCancel={() => setPendingDeleteAccount(false)}
            />
          </Card>
        </div>

        {/* Right column */}
        <div className='xl:col-span-2'>
          <form onSubmit={handleSubmit} className='space-y-5'>
            {/* Basic Info */}
            <Card>
              <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <Input
                  label='Username'
                  id='username'
                  defaultValue={currentUser.username}
                  onChange={handleChange}
                  placeholder='Enter username'
                  required
                />
                <Input
                  label='Email'
                  id='email'
                  type='email'
                  defaultValue={currentUser.email}
                  disabled
                />
                <Input
                  label='First Name'
                  id='firstName'
                  defaultValue={currentUser.firstName || ''}
                  onChange={handleChange}
                  placeholder='Enter first name'
                />
                <Input
                  label='Last Name'
                  id='lastName'
                  defaultValue={currentUser.lastName || ''}
                  onChange={handleChange}
                  placeholder='Enter last name'
                />
                <Input
                  label='Phone Number'
                  id='phone'
                  type='tel'
                  value={phoneInput}
                  onChange={handleChange}
                  placeholder='+1 (555) 123-4567'
                />
                <Select
                  label='Role'
                  id='role'
                  defaultValue={currentUser.role || 'user'}
                  onChange={handleChange}
                  disabled
                  hint={isAdmin ? 'Admins cannot change their own role' : 'Only admins can change roles'}
                >
                  <option value='user'>User</option>
                  <option value='employee'>Employee</option>
                  <option value='admin'>Admin</option>
                </Select>
              </div>
            </Card>

            {/* Address */}
            <Card>
              <CardHeader><CardTitle>Address Information</CardTitle></CardHeader>
              <div className='space-y-4'>
                <Input
                  label='Address Line 1'
                  id='addressLine1'
                  defaultValue={currentUser.addressLine1 || ''}
                  onChange={handleChange}
                  placeholder='Enter address line 1'
                />
                <Input
                  label='Address Line 2'
                  id='addressLine2'
                  defaultValue={currentUser.addressLine2 || ''}
                  onChange={handleChange}
                  placeholder='Enter address line 2'
                />
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                  <Input
                    label='City'
                    id='city'
                    defaultValue={currentUser.city || ''}
                    onChange={handleChange}
                    placeholder='City'
                  />
                  <Input
                    label='State'
                    id='state'
                    defaultValue={currentUser.state || ''}
                    onChange={handleChange}
                    placeholder='State'
                  />
                  <Input
                    label='Postal Code'
                    id='postalCode'
                    defaultValue={currentUser.postalCode || ''}
                    onChange={handleChange}
                    placeholder='Postal code'
                  />
                </div>
                <Input
                  label='Country'
                  id='country'
                  defaultValue={currentUser.country || ''}
                  onChange={handleChange}
                  placeholder='Country'
                />
              </div>
            </Card>

            {/* Bio */}
            <Card>
              <CardHeader><CardTitle>About You</CardTitle></CardHeader>
              <Textarea
                label='Biography'
                id='bio'
                defaultValue={currentUser.bio || ''}
                onChange={handleChange}
                rows={4}
                placeholder='Tell us about yourself...'
                maxLength={500}
                hint={`${currentUser.bio?.length || 0}/500 characters`}
              />
            </Card>

            <div className='flex justify-end'>
              <Button type='submit' loading={loading}>
                Save Changes
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Listings */}
      {(listingsLoaded || showListingsError) && (
        <Card>
          <CardHeader
            action={
              <Button variant='ghost' size='sm' onClick={handleShowListings} disabled={listingsLoading}>Refresh</Button>
            }
          >
            <CardTitle>Your Listings</CardTitle>
          </CardHeader>

          {showListingsError && (
            <p className='text-rose-600 text-sm mb-4'>Error loading listings. Please try again.</p>
          )}

          {!showListingsError && userListings.length === 0 && (
            <p className='text-slate-500 text-sm'>No listings found. Create one to get started.</p>
          )}

          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {userListings.map((listing) => (
              <div
                key={listing._id}
                className='border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow'
              >
                <Link to={`/listing/${listing._id}`}>
                  <img
                    src={normalizeImageUrl(listing.imageUrls[0])}
                    alt='listing cover'
                    className='w-full h-44 object-cover'
                  />
                </Link>
                <div className='p-4'>
                  <Link
                    className='text-sm font-semibold text-slate-900 hover:text-indigo-600 transition-colors'
                    to={`/listing/${listing._id}`}
                  >
                    <h3 className='truncate'>{listing.name}</h3>
                  </Link>
                  <div className='flex justify-between items-center mt-3'>
                    <span className='text-base font-bold text-indigo-600'>
                      ${listing.regularPrice?.toLocaleString()}
                    </span>
                    {!isBuyerViewMode && (
                      currentUser.role === 'admin' ||
                      currentUser.role === 'employee' ||
                      (currentUser.role === 'seller' && listing.userRef === currentUser._id)
                    ) && (
                      <div className='flex gap-2'>
                        <Link to={`/update-listing/${listing._id}`}>
                          <Button variant='ghost' size='xs'>Edit</Button>
                        </Link>
                        <Button
                          variant='ghost'
                          size='xs'
                          className='text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                          onClick={() => handleListingDelete(listing._id)}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
