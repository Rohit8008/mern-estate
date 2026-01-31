import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

export default function UserProfile() {
  const { userId } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/user/public/${userId}`);
        const data = await res.json();
        if (data.success === false) {
          setError(data.message || 'Failed to fetch user');
        } else {
          setUser(data);
        }
      } catch (e) {
        setError('Failed to fetch user');
      }
      setLoading(false);
    };
    load();
  }, [userId]);

  return (
    <main className='max-w-4xl mx-auto px-4 py-8'>
      {loading && <p>Loading...</p>}
      {error && <p className='text-red-600'>{error}</p>}
      {user && (
        <div className='bg-white rounded-xl shadow p-6'>
          <div className='flex items-center gap-4'>
            <img src={user.avatar} alt={user.username} className='w-20 h-20 rounded-full object-cover' />
            <div>
              <h1 className='text-2xl font-bold text-slate-800'>{user.username}</h1>
              <p className='text-slate-600'>{user.email}</p>
            </div>
          </div>
          {user.phone && (
            <div className='mt-4'>
              <p className='text-slate-700'><span className='font-semibold'>Phone:</span> {user.phone}</p>
            </div>
          )}
          <div className='mt-6'>
            <Link to={`/messages?user=${user._id}`} className='px-4 py-2 rounded bg-blue-600 text-white'>Chat with {user.username}</Link>
          </div>
        </div>
      )}
    </main>
  );
}


