import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { createSocket } from '../config/socket';

export default function Chat({ otherIdProp }) {
  const { otherId: otherIdParam } = useParams();
  const otherId = otherIdProp || otherIdParam;
  const { currentUser } = useSelector((s) => s.user);
  const location = useLocation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const typingTimerRef = useRef(null);
  const [otherUser, setOtherUser] = useState(null);
  const [peerOnline, setPeerOnline] = useState(false);
  const [sendingIds, setSendingIds] = useState({}); // optimistic tracking
  const bottomRef = useRef(null);
  const socketRef = useRef(null);
  // No call/voice/video features

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/message/thread/${otherId}`, { credentials: 'include' });
      const data = await res.json();
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading thread:', error);
    }
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  useEffect(() => {
    load();
    // mark as read on open
    (async () => {
      try {
        await fetch('/api/message/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ otherId }),
        });
      } catch (_) {}
    })();
    // fetch other user info
    (async () => {
      try {
        const res = await fetch(`/api/user/public/${otherId}`);
        const data = await res.json();
        if (!data?.success) setOtherUser(data);
      } catch (_) {}
    })();
    // prefill message from query param if any
    try {
      const params = new URLSearchParams(location.search);
      const text = params.get('text');
      if (text) setInput(text);
    } catch (_) {}
    const socket = createSocket(currentUser?._id, { transports: ['websocket'] });
    socket.on('message:new', (msg) => {
      if (msg.senderId === otherId && msg.receiverId === currentUser?._id) {
        setMessages((prev) => [...prev, msg]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        // actively mark as read when chat is open and message arrives
        (async () => {
          try {
            await fetch('/api/message/read', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ otherId }),
            });
          } catch (_) {}
        })();
      }
    });
    socket.on('typing', (data) => {
      if (data?.from === otherId) {
        setPeerTyping(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setPeerTyping(false), 2500);
      }
    });
    socket.on('stop_typing', (data) => {
      if (data?.from === otherId) setPeerTyping(false);
    });
    socket.on('message:read', (data) => {
      if (data?.from === otherId) {
        // mark my messages as read in UI
        setMessages((prev) => prev.map((m) => (m.senderId === currentUser?._id ? { ...m, read: true } : m)));
      }
    });
    socket.on('message:sent', (msg) => {
      if (msg.senderId === currentUser?._id && msg.receiverId === otherId) {
        setSendingIds((s) => ({ ...s, [msg._id]: true }));
      }
    });
    socket.on('presence:update', ({ userId: uid, online }) => {
      if (String(uid) === String(otherId)) setPeerOnline(!!online);
    });
    socket.on('presence:bulk', (ids) => {
      try {
        const online = (ids || []).some((id) => String(id) === String(otherId));
        setPeerOnline(online);
      } catch (_) {}
    });
    socketRef.current = socket;
    return () => {
      socket.close();
    };
  }, [otherId, currentUser?._id]);

  const send = async () => {
    if (!input.trim()) return;
    const tmpId = `tmp_${Date.now()}`;
    const optimistic = {
      _id: `tmp_${Date.now()}`,
      senderId: currentUser?._id,
      receiverId: otherId,
      content: input,
      createdAt: new Date().toISOString(),
      read: false,
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    try {
      const res = await fetch('/api/message/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ receiverId: otherId, content: input }),
      });
      const data = await res.json();
      if (data && data._id) {
        setInput('');
        // replace tmp with persisted id for tick states
        setMessages((prev) => prev.map((m) => (m._id === optimistic._id ? { ...data } : m)));
      }
    } catch (_) {}
  };

  const handleTyping = (e) => {
    setInput(e.target.value);
    if (socketRef.current) {
      if (e.target.value) socketRef.current.emit('typing', { to: otherId });
      else socketRef.current.emit('stop_typing', { to: otherId });
    }
  };

  const linkify = (text) => {
    try {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const parts = String(text || '').split(urlRegex);
      return parts.map((part, idx) => {
        if (urlRegex.test(part)) {
          return (
            <a key={`u_${idx}`} href={part} target="_blank" rel="noreferrer" className='underline text-blue-600 break-all'>
              {part}
            </a>
          );
        }
        return <span key={`t_${idx}`}>{part}</span>;
      });
    } catch (_) {
      return text;
    }
  };


  return (
    <main className='max-w-3xl mx-auto px-4 py-6'>
      <div className='border rounded-xl bg-white h-[72vh] flex flex-col'>
        <div className='border-b px-4 py-3 flex items-center gap-3'>
          <img
            src={otherUser?.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
            alt='avatar'
            className='w-9 h-9 rounded-full object-cover'
          />
          <div className='flex-1'>
            <div className='flex items-center gap-2'>
              <div className='font-semibold text-slate-800'>{otherUser?.username || 'Chat'}</div>
              <span className={`inline-block w-2 h-2 rounded-full ${peerOnline ? 'bg-green-500' : 'bg-slate-300'}`} />
            </div>
            <div className='text-xs text-slate-500 h-4'>{peerTyping ? 'typing…' : (peerOnline ? 'online' : '')}</div>
          </div>
        </div>
        <div className='flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50'>
          {loading && <p>Loading...</p>}
          {messages.map((m) => {
            const isMine = m.senderId === currentUser?._id;
            return (
              <div key={m._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm shadow ${isMine ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-slate-900 rounded-bl-sm'}`}>
                  <div className='whitespace-pre-wrap leading-relaxed break-words'>
                    {linkify(m.content)}
                  </div>
                  {m.listingId && (
                    <div className='mt-2'>
                      <a href={`/listing/${m.listingId}`} className={`inline-block text-xs px-2 py-1 rounded border ${isMine ? 'border-blue-200 text-blue-100 hover:bg-blue-500/10' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                        View Listing
                      </a>
                    </div>
                  )}
                  <div className={`mt-1 text-[10px] flex items-center gap-1 ${isMine ? 'opacity-80' : 'text-slate-500'}`}>
                    {new Date(m.createdAt).toLocaleTimeString()}
                    {isMine && (
                      <span className={`ml-1 ${m.read ? 'text-cyan-200' : (sendingIds[m._id] ? 'text-slate-100' : 'text-slate-200')}`} title={m.read ? 'Seen' : (sendingIds[m._id] ? 'Delivered' : 'Sent')}>
                        {m.read ? '✓✓' : (sendingIds[m._id] ? '✓' : '…')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {peerTyping && (
            <div className='text-xs text-slate-500 px-2 flex items-center gap-2'>
              <span className='inline-block w-2 h-2 rounded-full bg-slate-400 animate-pulse'></span>
              Typing...
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className='border-t p-3 flex gap-2 bg-white'>
          <input
            className='border rounded-lg p-2 flex-1'
            placeholder='Type a message...'
            value={input}
            onChange={handleTyping}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button onClick={send} className='px-4 py-2 rounded bg-blue-600 text-white'>Send</button>
        </div>
      </div>
    </main>
  );
}



