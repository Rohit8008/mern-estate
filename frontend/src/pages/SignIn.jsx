import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  signInStart,
  signInSuccess,
  signInFailure,
} from '../redux/user/userSlice';
import { apiClient, handleApiError } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import LoadingSpinner from '../components/LoadingSpinner';

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
