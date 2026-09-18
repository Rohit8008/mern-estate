import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HiOutlineLockClosed, HiOutlineExclamationCircle, HiOutlineArrowLeft } from 'react-icons/hi';
import { apiClient, handleApiError } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { Input, Button } from '../design-system';
import { useTranslation } from 'react-i18next';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [step, setStep] = useState(1); // 1: email, 2: OTP + new password
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');

  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiClient.post('/user/password/request-otp', { email }, { silent: true });
      setMaskedEmail(data.to || email);
      showSuccess(data.message || 'OTP sent to your email');
      setStep(2);
    } catch (err) {
      const apiError = handleApiError(err);
      setError(apiError.message);
      showError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Mirrors validatePassword() on the server. Kept in step deliberately: a
    // client rule that is looser than the server's just means the form accepts
    // something the API then rejects.
    const strongEnough =
      newPassword.length >= 8 &&
      /[A-Z]/.test(newPassword) &&
      /[a-z]/.test(newPassword) &&
      /\d/.test(newPassword) &&
      /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);

    if (!strongEnough) {
      setError('Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.');
      return;
    }

    setLoading(true);

    try {
      await apiClient.post('/user/password/reset', {
        email,
        otp,
        newPassword,
      }, { silent: true });
      showSuccess('Password reset successfully! Please sign in.');
      navigate('/sign-in');
    } catch (err) {
      const apiError = handleApiError(err);
      setError(apiError.message);
      showError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='min-h-[calc(100vh-3.5rem)] bg-slate-50 flex items-center justify-center p-4'>
      <div className='max-w-md w-full space-y-8'>
        {/* Header */}
        <div className='text-center'>
          <div className='flex justify-center mb-8'>
            <div className='w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20'>
              <HiOutlineLockClosed className='w-8 h-8 text-white' />
            </div>
          </div>
          <h1 className='text-3xl font-bold text-slate-900 mb-2'>
            {step === 1 ? 'Forgot Password?' : 'Reset Password'}
          </h1>
          <p className='text-base text-slate-600'>
            {step === 1
              ? "Enter your email and we'll send you an OTP"
              : `Enter the OTP sent to ${maskedEmail}`}
          </p>
        </div>

        {/* Form */}
        <div className='bg-white rounded-2xl border border-slate-200 shadow-md p-8'>
          {step === 1 ? (
            <form onSubmit={handleRequestOtp} className='space-y-5'>
              <Input
                label={t('forgotPassword.emailAddress')}
                type='email'
                id='email'
                value={email}
                placeholder={t('forgotPassword.enterYourEmail')}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <Button type='submit' size='lg' loading={loading} className='w-full justify-center'>{t('forgotPassword.sendOtp')}</Button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className='space-y-5'>
              <div>
                <label htmlFor='otp' className='block text-sm font-medium text-slate-700 mb-1'>{t('forgotPassword.enterOtp')}</label>
                <input
                  type='text'
                  id='otp'
                  value={otp}
                  placeholder='······'
                  maxLength={6}
                  inputMode='numeric'
                  className='w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors text-center text-2xl tracking-[0.4em] font-mono'
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>

              <Input
                label={t('forgotPassword.newPassword')}
                type='password'
                id='newPassword'
                value={newPassword}
                placeholder={t('forgotPassword.enterNewPassword')}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />

              <Input
                label={t('forgotPassword.confirmPassword')}
                type='password'
                id='confirmPassword'
                value={confirmPassword}
                placeholder={t('forgotPassword.confirmNewPassword')}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />

              <Button type='submit' size='lg' loading={loading} className='w-full justify-center'>{t('forgotPassword.resetPassword')}</Button>

              {/* Resend OTP */}
              <div className='text-center'>
                <button
                  type='button'
                  onClick={() => setStep(1)}
                  className='text-sm text-indigo-600 hover:text-indigo-800 font-medium focus-visible:outline-none focus-visible:underline'
                >
                  Didn&apos;t receive OTP? Go back and try again
                </button>
              </div>
            </form>
          )}

          {/* Error Message */}
          {error && (
            <div className='mt-6 p-4 bg-rose-50 border border-rose-200 rounded-xl'>
              <div className='flex items-start'>
                <HiOutlineExclamationCircle className='w-5 h-5 text-rose-500 mt-0.5 flex-shrink-0' />
                <div className='ml-3'>
                  <p className='text-sm font-medium text-rose-800'>{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Step indicator */}
          <div className='mt-6 flex justify-center space-x-2'>
            <div className={`w-2 h-2 rounded-full ${step === 1 ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
            <div className={`w-2 h-2 rounded-full ${step === 2 ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
          </div>
        </div>

        {/* Footer */}
        <div className='text-center'>
          <Link
            to='/sign-in'
            className='text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center justify-center gap-2'
          >
            <HiOutlineArrowLeft className='w-4 h-4' />{t('forgotPassword.backToSignIn')}</Link>
        </div>
      </div>
    </div>
  );
}
