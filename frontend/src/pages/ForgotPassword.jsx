import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient, handleApiError } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import LoadingSpinner from '../components/LoadingSpinner';

export default function ForgotPassword() {
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
      const data = await apiClient.post('/user/password/request-otp', { email });
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

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await apiClient.post('/user/password/reset', {
        email,
        otp,
        newPassword,
      });
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
    <div className='min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4'>
      <div className='max-w-md w-full space-y-8'>
        {/* Header */}
        <div className='text-center'>
          <div className='flex justify-center mb-8'>
            <div className='w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg'>
              <svg className='w-8 h-8 text-white' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' />
              </svg>
            </div>
          </div>
          <h1 className='text-4xl font-bold text-gray-900 mb-2'>
            {step === 1 ? 'Forgot Password?' : 'Reset Password'}
          </h1>
          <p className='text-lg text-gray-600'>
            {step === 1
              ? "Enter your email and we'll send you an OTP"
              : `Enter the OTP sent to ${maskedEmail}`}
          </p>
        </div>

        {/* Form */}
        <div className='bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200/50 p-8'>
          {step === 1 ? (
            <form onSubmit={handleRequestOtp} className='space-y-6'>
              <div>
                <label htmlFor='email' className='block text-sm font-semibold text-gray-700 mb-3'>
                  Email address
                </label>
                <input
                  type='email'
                  id='email'
                  value={email}
                  placeholder='Enter your email'
                  className='w-full border-2 border-gray-200 rounded-xl px-4 py-4 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:border-gray-300'
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <button
                type='submit'
                disabled={loading}
                className='w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 px-6 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
              >
                {loading ? (
                  <LoadingSpinner size='sm' color='white' text='Sending OTP...' />
                ) : (
                  'Send OTP'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className='space-y-6'>
              <div>
                <label htmlFor='otp' className='block text-sm font-semibold text-gray-700 mb-3'>
                  Enter OTP
                </label>
                <input
                  type='text'
                  id='otp'
                  value={otp}
                  placeholder='Enter 6-digit OTP'
                  maxLength={6}
                  className='w-full border-2 border-gray-200 rounded-xl px-4 py-4 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:border-gray-300 text-center text-2xl tracking-widest font-mono'
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>

              <div>
                <label htmlFor='newPassword' className='block text-sm font-semibold text-gray-700 mb-3'>
                  New Password
                </label>
                <input
                  type='password'
                  id='newPassword'
                  value={newPassword}
                  placeholder='Enter new password'
                  className='w-full border-2 border-gray-200 rounded-xl px-4 py-4 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:border-gray-300'
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <div>
                <label htmlFor='confirmPassword' className='block text-sm font-semibold text-gray-700 mb-3'>
                  Confirm Password
                </label>
                <input
                  type='password'
                  id='confirmPassword'
                  value={confirmPassword}
                  placeholder='Confirm new password'
                  className='w-full border-2 border-gray-200 rounded-xl px-4 py-4 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:border-gray-300'
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <button
                type='submit'
                disabled={loading}
                className='w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 px-6 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
              >
                {loading ? (
                  <LoadingSpinner size='sm' color='white' text='Resetting...' />
                ) : (
                  'Reset Password'
                )}
              </button>

              {/* Resend OTP */}
              <div className='text-center'>
                <button
                  type='button'
                  onClick={() => setStep(1)}
                  className='text-sm text-blue-600 hover:text-blue-800 font-medium'
                >
                  Didn't receive OTP? Go back and try again
                </button>
              </div>
            </form>
          )}

          {/* Error Message */}
          {error && (
            <div className='mt-6 p-4 bg-red-50/80 backdrop-blur-sm border-2 border-red-200 rounded-xl'>
              <div className='flex items-start'>
                <svg className='w-5 h-5 text-red-500 mt-0.5 flex-shrink-0' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' />
                </svg>
                <div className='ml-3'>
                  <p className='text-sm font-medium text-red-800'>{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Step indicator */}
          <div className='mt-6 flex justify-center space-x-2'>
            <div className={`w-2 h-2 rounded-full ${step === 1 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
            <div className={`w-2 h-2 rounded-full ${step === 2 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
          </div>
        </div>

        {/* Footer */}
        <div className='text-center'>
          <Link
            to='/sign-in'
            className='text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center'
          >
            <svg className='w-4 h-4 mr-2' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M10 19l-7-7m0 0l7-7m-7 7h18' />
            </svg>
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
