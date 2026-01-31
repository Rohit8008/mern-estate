import { useNavigate } from 'react-router-dom';

export default function SignUp() {
  const navigate = useNavigate();
  return (
    <div className='p-3 max-w-lg mx-auto text-center'>
      <h1 className='text-3xl font-semibold my-7'>Sign Up Disabled</h1>
      <p className='text-slate-700'>New registrations are not allowed. Please contact the admin.</p>
      <button onClick={() => navigate('/sign-in')} className='mt-6 bg-slate-700 text-white px-4 py-2 rounded-lg'>Go to Sign In</button>
    </div>
  );
}
