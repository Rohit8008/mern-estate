import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  signInStart,
  signInSuccess,
  signInFailure,
} from '../redux/user/userSlice';
import { apiClient, handleApiError, setUserSignedOut } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import LoadingSpinner from '../components/LoadingSpinner';
import usePageTitle from '../hooks/usePageTitle';

export default function SignIn() {
  usePageTitle('Sign In');
  const [formData, setFormData] = useState({});
  const { loading, error } = useSelector((state) => state.user);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { showSuccess, showError } = useNotification();

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
      navigate('/');
    } catch (error) {
      const apiError = handleApiError(error, error);
      dispatch(signInFailure(apiError.message));
      showError(apiError.message);
    }
  };

  return (
    <div className='min-h-[calc(100vh-3.5rem)] bg-slate-50 flex items-center justify-center p-4'>
      <div className='max-w-md w-full space-y-8'>
        {/* Header */}
        <div className='text-center'>
          <div className='flex justify-center mb-8'>
            <div className='w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg'>
              <span className='text-white font-bold text-2xl'>R</span>
            </div>
          </div>
          <h1 className='text-4xl font-bold text-slate-900 mb-2'>Welcome back</h1>
          <p className='text-lg text-slate-600'>Sign in to your account</p>
        </div>

        {/* Form */}
        <div className='bg-white rounded-2xl border border-slate-200 shadow-md p-8'>
          <form onSubmit={handleSubmit} className='space-y-6'>
            <div>
              <label htmlFor='email' className='block text-sm font-semibold text-slate-700 mb-3'>
                Email address
              </label>
              <input
                type='email'
                id='email'
                placeholder='Enter your email'
                className='w-full border border-slate-200 rounded-xl px-4 py-3.5 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors hover:border-slate-300'
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label htmlFor='password' className='block text-sm font-semibold text-slate-700 mb-3'>
                Password
              </label>
              <input
                type='password'
                id='password'
                placeholder='Enter your password'
                className='w-full border border-slate-200 rounded-xl px-4 py-3.5 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors hover:border-slate-300'
                onChange={handleChange}
                required
              />
            </div>

            <div className='flex justify-end'>
              <Link
                to='/forgot-password'
                className='text-sm text-indigo-600 hover:text-indigo-800 font-medium'
              >
                Forgot password?
              </Link>
            </div>

            <button
              type='submit'
              disabled={loading}
              className='w-full bg-indigo-600 text-white py-3.5 px-6 rounded-xl font-semibold hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center'
            >
              {loading ? (
                <LoadingSpinner size="sm" color="white" text="Signing in..." />
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Error Message */}
          {error && (
            <div className='mt-6 p-4 bg-red-50 border border-red-200 rounded-xl'>
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
        </div>

        {/* Footer */}
        <div className='text-center'>
          <p className='text-sm text-slate-500 font-medium'>
            Need access? Contact your administrator
          </p>
        </div>
      </div>

    </div>
  );
}
