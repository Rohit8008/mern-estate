import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { HiOutlineOfficeBuilding, HiOutlineExclamationCircle } from 'react-icons/hi';
import {
  signInStart,
  signInSuccess,
  signInFailure,
} from '../redux/user/userSlice';
import { apiClient, handleApiError, setUserSignedOut } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { Input, Button } from '../design-system';
import usePageTitle from '../hooks/usePageTitle';
import WorkspacePicker from '../components/WorkspacePicker';
import { useTranslation } from 'react-i18next';

export default function SignIn() {
  const { t } = useTranslation();
  usePageTitle('Sign In');
  const [formData, setFormData] = useState({});
  const { loading, error } = useSelector((state) => state.user);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { showSuccess } = useNotification();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.id]: e.target.value,
    });
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      dispatch(signInStart());
      const data = await apiClient.post('/auth/signin', formData, { silent: true });
      setUserSignedOut(false);
      dispatch(signInSuccess(data));
      showSuccess('Welcome back! You have been signed in successfully.');
      // Agency staff work in the CRM; the landing page is for visitors.
      const isCrmUser = data?.role === 'admin' || data?.role === 'employee';
      navigate(isCrmUser ? '/dashboard' : '/');
    } catch (error) {
      const apiError = handleApiError(error, error);
      dispatch(signInFailure(apiError.message));
    }
  };

  return (
    <div className='min-h-[calc(100vh-3.5rem)] bg-slate-50 flex items-center justify-center p-4'>
      <div className='max-w-md w-full space-y-8'>
        {/* Header */}
        <div className='text-center'>
          <div className='flex justify-center mb-8'>
            <div className='w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20'>
              <HiOutlineOfficeBuilding className='w-8 h-8 text-white' />
            </div>
          </div>
          <h1 className='text-4xl font-bold text-slate-900 mb-2'>{t('signIn.welcomeBack')}</h1>
          <p className='text-lg text-slate-600'>{t('signIn.signInToYourAccount')}</p>
        </div>

        {/* Form */}
        <div className='bg-white rounded-2xl border border-slate-200 shadow-md p-8'>
          {/* Which agency: every workspace shares this address. */}
          <div className='mb-5'>
            <WorkspacePicker onChange={() => dispatch(signInFailure(null))} />
          </div>
          <form onSubmit={handleSubmit} className='space-y-5'>
            <Input
              label={t('signIn.emailAddress')}
              type='email'
              id='email'
              placeholder={t('signIn.enterYourEmail')}
              onChange={handleChange}
              required
            />

            <Input
              label={t('signIn.password')}
              type='password'
              id='password'
              placeholder={t('signIn.enterYourPassword')}
              onChange={handleChange}
              required
            />

            <div className='flex justify-end -mt-1'>
              <Link
                to='/forgot-password'
                className='text-sm text-indigo-600 hover:text-indigo-800 font-medium'
              >{t('signIn.forgotPassword')}</Link>
            </div>

            <Button type='submit' size='lg' loading={loading} className='w-full justify-center'>{t('signIn.signIn')}</Button>
          </form>

          {/* Error Message */}
          {error && (
            <div role='alert' className='mt-6 p-4 bg-rose-50 border border-rose-200 rounded-xl'>
              <div className='flex items-start'>
                <HiOutlineExclamationCircle className='w-5 h-5 text-rose-500 mt-0.5 flex-shrink-0' aria-hidden='true' />
                <div className='ml-3'>
                  <p className='text-sm font-medium text-rose-800'>{error}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className='text-center'>
          <p className='text-sm text-slate-500 font-medium'>{t('signIn.needAccessContactYourAdministrator')}</p>
          <p className='text-sm text-slate-500 mt-2'>
            <Link to='/download' className='font-medium text-brand-700 hover:underline'>{t('signIn.getAndroidApp')}</Link>
          </p>
        </div>
      </div>

    </div>
  );
}
