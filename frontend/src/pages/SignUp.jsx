import { useNavigate } from 'react-router-dom';
import usePageTitle from '../hooks/usePageTitle';

export default function SignUp() {
  usePageTitle('Create Account');
  const navigate = useNavigate();
  return (
    <div className='min-h-[calc(100vh-3.5rem)] bg-slate-50 flex items-center justify-center p-4'>
      <div className='bg-white/80 backdrop-blur rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm p-8 flex flex-col items-center gap-6'>
        {/* Logo */}
        <div className='flex items-center gap-2'>
          <div className='w-9 h-9 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl flex items-center justify-center'>
            <span className='text-white font-bold text-base'>R</span>
          </div>
          <span className='text-xl font-bold text-slate-900'>Real Vista</span>
        </div>

        {/* Message */}
        <div className='text-center'>
          <h1 className='text-xl font-bold text-slate-900 mb-2'>Registrations Closed</h1>
          <p className='text-sm text-slate-500 leading-relaxed'>
            New accounts are created by invitation only. Please contact your administrator to get access.
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={() => navigate('/sign-in')}
          className='w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm'
        >
          Go to Sign In
        </button>
      </div>
    </div>
  );
}
