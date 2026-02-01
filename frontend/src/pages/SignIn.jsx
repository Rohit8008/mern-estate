import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  signInStart,
  signInSuccess,
  signInFailure,
} from '../redux/user/userSlice';
import { apiClient, handleApiError } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { GoogleAuthProvider, getAuth, signInWithPopup } from 'firebase/auth';
import { app } from '../firebase';

export default function SignIn() {
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
      const data = await apiClient.post('/auth/signin', formData);
      dispatch(signInSuccess(data));
      showSuccess('Welcome back! You have been signed in successfully.');
      navigate('/');
    } catch (error) {
      const apiError = handleApiError(error, error);
      dispatch(signInFailure(apiError.message));
      showError(apiError.message);
    }
  };

  const handleGoogleClick = async () => {
    try {
      dispatch(signInStart());
      const provider = new GoogleAuthProvider();
      const auth = getAuth(app);
      const result = await signInWithPopup(auth, provider);
      
      const data = await apiClient.post('/auth/google', {
        name: result.user.displayName,
        email: result.user.email,
        photo: result.user.photoURL,
      });
      
      dispatch(signInSuccess(data));
      showSuccess('Welcome! You have been signed in with Google.');
      navigate('/');
    } catch (error) {
      const apiError = handleApiError(error, error);
      dispatch(signInFailure(apiError.message));
      showError(apiError.message || 'Could not sign in with Google');
    }
  };
  return (
    <div className='min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4'>
      <div className='max-w-md w-full space-y-8'>
        {/* Header */}
        <div className='text-center'>
          <div className='flex justify-center mb-8'>
            <div className='w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg'>
              <span className='text-white font-bold text-2xl'>R</span>
            </div>
          </div>
          <h1 className='text-4xl font-bold text-gray-900 mb-2'>Welcome back</h1>
          <p className='text-lg text-gray-600'>Sign in to your account</p>
        </div>

        {/* Form */}
        <div className='bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200/50 p-8'>
          <form onSubmit={handleSubmit} className='space-y-6'>
            <div>
              <label htmlFor='email' className='block text-sm font-semibold text-gray-700 mb-3'>
                Email address
              </label>
              <input
                type='email'
                id='email'
                placeholder='Enter your email'
                className='w-full border-2 border-gray-200 rounded-xl px-4 py-4 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:border-gray-300'
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label htmlFor='password' className='block text-sm font-semibold text-gray-700 mb-3'>
                Password
              </label>
              <input
                type='password'
                id='password'
                placeholder='Enter your password'
                className='w-full border-2 border-gray-200 rounded-xl px-4 py-4 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:border-gray-300'
                onChange={handleChange}
                required
              />
            </div>

            <div className='flex justify-end'>
              <Link
                to='/forgot-password'
                className='text-sm text-blue-600 hover:text-blue-800 font-medium'
              >
                Forgot password?
              </Link>
            </div>

            <button
              type='submit'
              disabled={loading}
              className='w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 px-6 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
            >
              {loading ? (
                <LoadingSpinner size="sm" color="white" text="Signing in..." />
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className='relative my-6'>
            <div className='absolute inset-0 flex items-center'>
              <div className='w-full border-t border-gray-300'></div>
            </div>
            <div className='relative flex justify-center text-sm'>
              <span className='px-4 bg-white/80 text-gray-500 font-medium'>Or continue with</span>
            </div>
          </div>

          {/* Google Sign In Button */}
          <button
            type='button'
            onClick={handleGoogleClick}
            disabled={loading}
            className='w-full bg-white border-2 border-gray-300 text-gray-700 py-4 px-6 rounded-xl font-semibold hover:bg-gray-50 hover:border-gray-400 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-md hover:shadow-lg transform hover:-translate-y-0.5'
          >
            <svg className='w-5 h-5 mr-3' viewBox='0 0 24 24'>
              <path fill='#4285F4' d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'/>
              <path fill='#34A853' d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'/>
              <path fill='#FBBC05' d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'/>
              <path fill='#EA4335' d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'/>
            </svg>
            {loading ? 'Signing in...' : 'Sign in with Google'}
          </button>

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
        </div>

        {/* Footer */}
        <div className='text-center'>
          <p className='text-sm text-gray-500 font-medium'>
            Need access? Contact your administrator
          </p>
        </div>
      </div>
    </div>
  );
}
