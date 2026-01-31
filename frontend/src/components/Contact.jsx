import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { parseJsonSafely } from '../utils/http';

export default function Contact({ listing }) {
  const [landlord, setLandlord] = useState(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const { currentUser } = useSelector((state) => state.user);
  const maxLen = 1000;
  
  // Check if user is a buyer (no role or role is 'buyer')
  const isBuyer = !currentUser?.role || currentUser?.role === 'buyer';
  const onChange = (e) => {
    setMessage(e.target.value);
  };

  useEffect(() => {
    const fetchLandlord = async () => {
      try {
        const res = await fetch(`/api/user/public/${listing.userRef}`);
        const data = await parseJsonSafely(res);
        setLandlord(data);
      } catch (error) {
        console.log(error);
      }
    };
    fetchLandlord();
  }, [listing.userRef]);
  return (
    <>
      {landlord && (
        <div className='flex flex-col gap-3'>
          {!isBuyer && (
            <div className='flex items-center gap-3'>
              <img
                src={landlord.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
                alt='landlord'
                className='w-10 h-10 rounded-full object-cover'
              />
              <div>
                <div className='text-sm text-slate-600'>Contact</div>
                <div className='font-semibold'>{landlord.username}</div>
              </div>
            </div>
          )}
          {isBuyer && (
            <div className='text-center py-2'>
              <div className='text-sm text-slate-600'>Contact Property Agent</div>
              <div className='font-semibold text-gray-800'>Get in touch for more details</div>
            </div>
          )}

          <div className='flex items-center gap-3 border rounded-lg p-3 bg-white'>
            <img
              src={listing.imageUrls?.[0] || 'https://placehold.co/64x64'}
              alt='listing'
              className='w-16 h-16 rounded object-cover'
            />
            <div className='flex-1 min-w-0'>
              <div className='font-semibold truncate'>{listing.name}</div>
              <div className='text-xs text-slate-600 truncate'>{listing.address}</div>
            </div>
            <button
              type='button'
              className='text-xs text-blue-700 hover:underline'
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/listing/${listing._id}`)}
            >
              Copy link
            </button>
          </div>

          <div className='flex flex-wrap gap-2'>
            {isBuyer ? (
              ['Is this property still available?', 'Can I schedule a viewing?', 'What are the pricing details?'].map((q) => (
                <button
                  key={q}
                  type='button'
                  onClick={() => setMessage((m) => (m ? `${m}\n\n${q}` : q))}
                  className='px-2 py-1 text-xs border rounded-full hover:bg-slate-50'
                >
                  {q}
                </button>
              ))
            ) : (
              ['Is this still available?', 'Can I schedule a viewing?', 'Is the price negotiable?'].map((q) => (
                <button
                  key={q}
                  type='button'
                  onClick={() => setMessage((m) => (m ? `${m}\n\n${q}` : q))}
                  className='px-2 py-1 text-xs border rounded-full hover:bg-slate-50'
                >
                  {q}
                </button>
              ))
            )}
          </div>
          <textarea
            name='message'
            id='message'
            rows='6'
            value={message}
            onChange={onChange}
            placeholder='Enter your message here...'
            className='w-full border p-3 rounded-lg'
          ></textarea>
          <div className='text-xs text-slate-500 self-end'>{message.length}/{maxLen}</div>
          <div className='flex gap-2'>
            <a
              href={`/messages?user=${landlord._id}&text=${encodeURIComponent(message)}`}
              className='bg-blue-600 text-white text-center p-3 uppercase rounded-lg hover:opacity-95'
            >
              Open Chat
            </a>
            <button
            onClick={async () => {
              try {
                if (!message.trim()) {
                  setStatus('Please enter a message');
                  return;
                }
                if (message.length > maxLen) {
                  setStatus('Message is too long');
                  return;
                }
                setSending(true);
                setStatus('');
                const res = await fetch('/api/message/send', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ receiverId: landlord._id, listingId: listing._id, content: message }),
                });
                const data = await parseJsonSafely(res);
                if (data && data._id) {
                  setMessage('');
                  setStatus('Message sent');
                }
              } catch (e) {
                setStatus('Failed to send message');
              }
              setSending(false);
            }}
            className='bg-slate-700 text-white text-center p-3 uppercase rounded-lg hover:opacity-95 disabled:opacity-60'
            disabled={sending}
          >
            {sending ? 'Sending...' : 'Send Message'}
          </button>
          </div>
          {status && <p className='text-sm text-slate-600'>{status}</p>}
        </div>
      )}
    </>
  );
}
