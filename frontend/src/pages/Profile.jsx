import { useSelector, useDispatch } from 'react-redux';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiX, HiEye, HiEyeOff, HiCog, HiLogout, HiCamera,
} from 'react-icons/hi';
import ConfirmDialog from '../components/ConfirmDialog';
import CameraCapture from '../components/CameraCapture';
import {
  updateUserStart, updateUserSuccess, updateUserFailure,
  deleteUserFailure, deleteUserStart, deleteUserSuccess,
  signOutUserStart, signOutUserSuccess, signOutUserFailure,
} from '../redux/user/userSlice';
import { apiClient, normalizeImageUrl, setUserSignedOut } from '../utils/http';
import { formatListingPrice } from '../utils/currency';
import { uploadToCloudinary } from '../utils/cloudinary';
import { DEFAULT_AVATAR_URL } from '../utils/avatarPlaceholder';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { useNotification } from '../contexts/NotificationContext';
import {
  PageHeader, Button,
  Card, CardHeader, CardTitle,
  Input, Select, Textarea,
} from '../design-system';
import { useTranslation } from 'react-i18next';

const INPUT_CLS =
  'w-full border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white pl-3 pr-9 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400';

export default function Profile() {
  const { t } = useTranslation();
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

  const { showSuccess, showError } = useNotification();

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
        showError(data.message || 'Failed to update profile');
        return;
      }
      dispatch(updateUserSuccess(data));
      showSuccess('Profile updated successfully!');
    } catch (err) {
      dispatch(updateUserFailure(err.message));
      showError(err.message || 'Failed to update profile');
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    try {
      setPasswordError('');
      setPasswordSuccess(false);
      const data = await apiClient.post('/user/password/change', {
        currentPassword: passwordData.oldPassword,
        newPassword: passwordData.newPassword,
      }, { silent: true });
      if (data.success === false) {
        setPasswordError(data.message || 'Password change failed');
        showError(data.message || 'Password change failed');
        return;
      }
      setPasswordSuccess(true);
      setPasswordData({ oldPassword: '', newPassword: '' });
      // The change signs out every session, this one included.
      showSuccess('Password changed. Please sign in again.');
      setTimeout(handleSignOut, 1500);
    } catch (err) {
      const message = err?.message || 'Password change failed. Please try again.';
      setPasswordError(message);
      showError(message);
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
      {/* Header */}
      <PageHeader
        title={t('profile.myProfile')}
        description={t('profile.manageYourPersonalInformationAndAccount')}
        actions={
          <div className='flex items-center gap-2'>
            <Link
              to='/settings'
              className='inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-700 transition-colors'
            >
              <HiCog className='w-4 h-4' />{t('profile.settings')}</Link>
            <Button icon={HiLogout} onClick={handleSignOut}>{t('profile.signOut')}</Button>
          </div>
        }
      />

      {/* Layout */}
      <div className='grid grid-cols-1 xl:grid-cols-3 gap-6'>
        {/* Left column */}
        <div className='xl:col-span-1 space-y-5'>
          {/* Photo */}
          <Card>
            <CardHeader><CardTitle>{t('profile.profilePhoto')}</CardTitle></CardHeader>
            <div className='flex flex-col items-center gap-3'>
              <div className='relative'>
                <img
                  onClick={() => fileRef.current.click()}
                  src={formData.avatar || currentUser.avatar || DEFAULT_AVATAR_URL}
                  alt='profile'
                  className='w-24 h-24 rounded-full object-cover cursor-pointer border-4 border-slate-200 hover:border-indigo-300 transition-colors'
                  onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR_URL; }}
                />
                <button
                  type='button'
                  onClick={() => setFormData((prev) => ({ ...prev, avatar: '' }))}
                  className='absolute -top-1 -right-1 bg-rose-500 text-white rounded-full p-1 hover:bg-rose-600 transition-colors'
                >
                  <HiX className='w-3 h-3' />
                </button>
              </div>
              <input onChange={handleFileChange} type='file' ref={fileRef} hidden accept='image/*' />
              <Button variant='secondary' className='w-full justify-center' onClick={() => fileRef.current.click()}>{t('profile.changePhoto')}</Button>
              <Button variant='secondary' icon={HiCamera} className='w-full justify-center' onClick={() => setCameraOpen(true)}>{t('profile.takePhoto')}</Button>
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
                <p className='text-emerald-600 text-xs text-center'>{t('profile.uploadedSuccessfully')}</p>
              )}
            </div>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader><CardTitle>{t('profile.quickActions')}</CardTitle></CardHeader>
            <div className='space-y-2'>
              {!isBuyerViewMode && (currentUser.role === 'admin' || currentUser.role === 'employee' || currentUser.role === 'seller') && (
                <Button as={Link} to='/create-listing' variant='primary' className='w-full justify-center'>{t('profile.createNewListing')}</Button>
              )}
              <Button variant='secondary' className='w-full justify-center' onClick={handleShowListings} disabled={listingsLoading}>
                {listingsLoading ? 'Loading...' : 'View My Listings'}
              </Button>
              {!isBuyerViewMode && (isAdmin || isEmployee) && (
                <Button as={Link} to='/admin' variant='secondary' className='w-full justify-center'>
                  {isAdmin ? 'Admin Panel' : 'Employee Panel'}
                </Button>
              )}
            </div>
          </Card>

          {/* Change Password */}
          <Card>
            <CardHeader><CardTitle>{t('profile.changePassword')}</CardTitle></CardHeader>
            <form onSubmit={handlePasswordSubmit} className='space-y-4'>
              <div>
                <label className='block text-sm font-medium text-slate-700 mb-1'>{t('profile.currentPassword')}</label>
                <div className='relative'>
                  <input
                    type={showPassword.old ? 'text' : 'password'}
                    id='oldPassword'
                    value={passwordData.oldPassword}
                    onChange={(e) => { setPasswordData((p) => ({ ...p, oldPassword: e.target.value })); setPasswordError(''); }}
                    className={INPUT_CLS}
                    placeholder={t('profile.enterCurrentPassword')}
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
                <label className='block text-sm font-medium text-slate-700 mb-1'>{t('profile.newPassword')}</label>
                <div className='relative'>
                  <input
                    type={showPassword.new ? 'text' : 'password'}
                    id='newPassword'
                    value={passwordData.newPassword}
                    onChange={(e) => { setPasswordData((p) => ({ ...p, newPassword: e.target.value })); setPasswordError(''); }}
                    className={INPUT_CLS}
                    placeholder={t('profile.enterNewPassword')}
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
              {passwordSuccess && <p className='text-emerald-600 text-xs'>{t('profile.passwordChangedSuccessfully')}</p>}
              <Button type='submit' variant='primary' className='w-full justify-center'>{t('profile.updatePassword')}</Button>
            </form>
          </Card>

          {/* Danger Zone */}
          <Card className='border-rose-200'>
            <CardHeader><CardTitle className='text-rose-600'>{t('profile.dangerZone')}</CardTitle></CardHeader>
            <p className='text-sm text-slate-500 mb-4'>{t('profile.deletingYourAccountIsPermanentAnd')}</p>
            <button
              type='button'
              onClick={() => setPendingDeleteAccount(true)}
              className='w-full py-2 px-4 text-sm font-medium text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors'
            >{t('profile.deleteMyAccount')}</button>
            <ConfirmDialog
              open={pendingDeleteAccount}
              title={t('profile.deleteYourAccount')}
              description={t('profile.thisActionCannotBeUndoneAll')}
              confirmLabel={t('profile.deleteAccount')}
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
              <CardHeader><CardTitle>{t('profile.basicInformation')}</CardTitle></CardHeader>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <Input
                  label={t('profile.username')}
                  id='username'
                  defaultValue={currentUser.username}
                  onChange={handleChange}
                  placeholder={t('profile.enterUsername')}
                  required
                />
                <Input
                  label={t('profile.email')}
                  id='email'
                  type='email'
                  defaultValue={currentUser.email}
                  disabled
                />
                <Input
                  label={t('profile.firstName')}
                  id='firstName'
                  defaultValue={currentUser.firstName || ''}
                  onChange={handleChange}
                  placeholder={t('profile.enterFirstName')}
                />
                <Input
                  label={t('profile.lastName')}
                  id='lastName'
                  defaultValue={currentUser.lastName || ''}
                  onChange={handleChange}
                  placeholder={t('profile.enterLastName')}
                />
                <Input
                  label={t('profile.phoneNumber')}
                  id='phone'
                  type='tel'
                  value={phoneInput}
                  onChange={handleChange}
                  placeholder='+1 (555) 123-4567'
                />
                <Select
                  label={t('profile.role')}
                  id='role'
                  defaultValue={currentUser.role || 'user'}
                  onChange={handleChange}
                  disabled
                  hint={isAdmin ? 'Admins cannot change their own role' : 'Only admins can change roles'}
                >
                  <option value='user'>{t('profile.user')}</option>
                  <option value='employee'>{t('profile.employee')}</option>
                  <option value='admin'>{t('profile.admin')}</option>
                </Select>
              </div>
            </Card>

            {/* Address */}
            <Card>
              <CardHeader><CardTitle>{t('profile.addressInformation')}</CardTitle></CardHeader>
              <div className='space-y-4'>
                <Input
                  label={t('profile.addressLine1')}
                  id='addressLine1'
                  defaultValue={currentUser.addressLine1 || ''}
                  onChange={handleChange}
                  placeholder={t('profile.enterAddressLine1')}
                />
                <Input
                  label={t('profile.addressLine2')}
                  id='addressLine2'
                  defaultValue={currentUser.addressLine2 || ''}
                  onChange={handleChange}
                  placeholder={t('profile.enterAddressLine2')}
                />
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                  <Input
                    label={t('profile.city')}
                    id='city'
                    defaultValue={currentUser.city || ''}
                    onChange={handleChange}
                    placeholder={t('profile.city')}
                  />
                  <Input
                    label={t('profile.state')}
                    id='state'
                    defaultValue={currentUser.state || ''}
                    onChange={handleChange}
                    placeholder={t('profile.state')}
                  />
                  <Input
                    label={t('profile.postalCode')}
                    id='postalCode'
                    defaultValue={currentUser.postalCode || ''}
                    onChange={handleChange}
                    placeholder={t('profile.postalCode2')}
                  />
                </div>
                <Input
                  label={t('profile.country')}
                  id='country'
                  defaultValue={currentUser.country || ''}
                  onChange={handleChange}
                  placeholder={t('profile.country')}
                />
              </div>
            </Card>

            {/* Bio */}
            <Card>
              <CardHeader><CardTitle>{t('profile.aboutYou')}</CardTitle></CardHeader>
              <Textarea
                label={t('profile.biography')}
                id='bio'
                defaultValue={currentUser.bio || ''}
                onChange={handleChange}
                rows={4}
                placeholder={t('profile.tellUsAboutYourself')}
                maxLength={500}
                hint={`${currentUser.bio?.length || 0}/500 characters`}
              />
            </Card>

            <div className='flex justify-end'>
              <Button type='submit' loading={loading}>{t('profile.saveChanges')}</Button>
            </div>
          </form>
        </div>
      </div>

      {/* Listings */}
      {(listingsLoaded || showListingsError) && (
        <Card>
          <CardHeader
            action={
              <Button variant='ghost' size='sm' onClick={handleShowListings} disabled={listingsLoading}>{t('profile.refresh')}</Button>
            }
          >
            <CardTitle>{t('profile.yourListings')}</CardTitle>
          </CardHeader>

          {showListingsError && (
            <p className='text-rose-600 text-sm mb-4'>{t('profile.errorLoadingListingsPleaseTryAgain')}</p>
          )}

          {!showListingsError && userListings.length === 0 && (
            <p className='text-slate-500 text-sm'>{t('profile.noListingsFoundCreateOneTo')}</p>
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
                    alt={t('profile.listingCover')}
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
                      {formatListingPrice(listing.regularPrice)}
                    </span>
                    {!isBuyerViewMode && (
                      currentUser.role === 'admin' ||
                      currentUser.role === 'employee' ||
                      (currentUser.role === 'seller' && listing.userRef === currentUser._id)
                    ) && (
                      <div className='flex gap-2'>
                        <Button as={Link} to={`/update-listing/${listing._id}`} variant='ghost' size='xs'>{t('profile.edit')}</Button>
                        <Button
                          variant='ghost'
                          size='xs'
                          className='text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                          onClick={() => handleListingDelete(listing._id)}
                        >{t('profile.delete')}</Button>
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
