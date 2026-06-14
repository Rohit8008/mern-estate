import { useState } from 'react';
import { useSelector } from 'react-redux';
import { apiClient, normalizeImageUrl } from '../utils/http';

export default function Contact({ listing }) {
  const landlord = listing.owner || null;
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const { currentUser } = useSelector((state) => state.user);
  const maxLen = 1000;

  const isBuyer = !currentUser?.role || currentUser?.role === 'buyer';
  const onChange = (e) => {
    setMessage(e.target.value);
  };

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
                <div className='font-semibold text-slate-900'>{landlord.username}</div>
              </div>
            </div>
          )}
          {isBuyer && (
            <div className='text-center py-2'>
              <div className='text-sm text-slate-600'>Contact Property Agent</div>
              <div className='font-semibold text-slate-800'>Get in touch for more details</div>
            </div>
          )}

          <div className='flex items-center gap-3 border border-slate-200 rounded-xl p-4 bg-slate-50'>
            <img
              src={normalizeImageUrl(listing.imageUrls?.[0]) || 'https://placehold.co/64x64'}
              alt='listing'
              className='w-16 h-16 rounded object-cover'
            />
            <div className='flex-1 min-w-0'>
              <div className='font-semibold truncate text-slate-900'>{listing.name}</div>
              <div className='text-xs text-slate-600 truncate'>{listing.address}</div>
            </div>
            <button
              type='button'
              className='text-indigo-600 hover:text-indigo-700 text-sm font-medium'
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/listing/${listing._id}`)}
            >
              Copy link
            </button>
          </div>

          <div className='flex flex-wrap gap-2'>
            {(isBuyer
              ? ['Is this property still available?', 'Can I schedule a viewing?', 'What are the pricing details?']
              : ['Is this still available?', 'Can I schedule a viewing?', 'Is the price negotiable?']
            ).map((q) => (
              <button
                key={q}
                type='button'
                onClick={() => setMessage((m) => (m ? `${m}\n\n${q}` : q))}
                className='px-2 py-1 text-xs border border-slate-200 rounded-full text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors'
              >
                {q}
              </button>
            ))}
          </div>

          <textarea
            name='message'
            id='message'
            rows='6'
            value={message}
            onChange={onChange}
            placeholder='Enter your message here...'
            className='w-full border border-slate-200 rounded-xl p-3 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none'
          />
          <div className='text-xs text-slate-500 self-end'>{message.length}/{maxLen}</div>

          <div className='flex gap-2'>
            <a
              href={`/messages?user=${landlord._id}&text=${encodeURIComponent(message)}`}
              className='flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors text-center'
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
                  const data = await apiClient.post('/message/send', { receiverId: landlord._id, listingId: listing._id, content: message });
                  if (data && data._id) {
                    setMessage('');
                    setStatus('Message sent');
                  }
                } catch (e) {
                  setStatus('Failed to send message');
                }
                setSending(false);
              }}
              className='flex-1 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg px-4 py-2.5 transition-colors disabled:opacity-50'
              disabled={sending}
            >
              {sending ? 'Sending...' : 'Send Message'}
            </button>
          </div>
          {status && (
            <p className={`text-sm ${
              status === 'Message sent' ? 'text-emerald-600' :
              status.startsWith('Failed') ? 'text-rose-600' :
              'text-slate-500'
            }`}>
              {status}
            </p>
          )}
        </div>
      )}
    </>
  );
}
