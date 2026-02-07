import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { createSocket } from '../config/socket';
import { apiClient } from '../utils/http';

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
  const socketRef = useRef(null);
  // No call/voice/video features

  const load = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get(`/message/thread/${otherId}`);
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading thread:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // mark as read on open
    (async () => {
      try {
        await apiClient.post('/message/read', { otherId });
      } catch (_) {}
    })();
    // fetch other user info
    (async () => {
      try {
        const data = await apiClient.get(`/user/public/${otherId}`);
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
        // actively mark as read when chat is open and message arrives
        (async () => {
          try {
            await apiClient.post('/message/read', { otherId });
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
      _id: tmpId,
      senderId: currentUser?._id,
      receiverId: otherId,
      content: input,
      createdAt: new Date().toISOString(),
      read: false,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const data = await apiClient.post('/message/send', { receiverId: otherId, content: input });
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


  const messagesContainerRef = useRef(null);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  // Update all scroll calls to use the new method
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const isEmbedded = !!otherIdProp;

  const chatContent = (
    <div className={`border rounded-xl bg-white flex flex-col shadow-sm ${isEmbedded ? 'h-[calc(100vh-180px)]' : 'h-[72vh]'}`}>
      {/* Chat Header */}
      <div className='border-b px-4 py-3 flex items-center gap-3 bg-gradient-to-r from-slate-50 to-white'>
        <div className='relative'>
          <img
            src={otherUser?.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
            alt='avatar'
            className='w-11 h-11 rounded-full object-cover ring-2 ring-slate-100'
          />
          <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${peerOnline ? 'bg-green-500' : 'bg-slate-300'}`} />
        </div>
        <div className='flex-1'>
          <div className='font-semibold text-slate-800'>{otherUser?.username || 'Chat'}</div>
          <div className='text-xs text-slate-500 h-4'>
            {peerTyping ? (
              <span className='text-blue-600 font-medium'>typing...</span>
            ) : peerOnline ? (
              <span className='text-green-600'>Online</span>
            ) : (
              <span className='text-slate-400'>Offline</span>
            )}
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className='flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-slate-50 to-slate-100'
      >
        {loading && (
          <div className='flex justify-center py-8'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600'></div>
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className='flex flex-col items-center justify-center h-full text-slate-400'>
            <svg xmlns='http://www.w3.org/2000/svg' className='h-16 w-16 mb-3 opacity-50' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' />
            </svg>
            <p className='text-sm'>No messages yet</p>
            <p className='text-xs mt-1'>Start the conversation!</p>
          </div>
        )}
        {messages.map((m) => {
          const isMine = m.senderId === currentUser?._id;
          return (
            <div key={m._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                isMine
                  ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-md'
                  : 'bg-white text-slate-800 rounded-bl-md border border-slate-100'
              }`}>
                <div className='whitespace-pre-wrap leading-relaxed break-words'>
                  {linkify(m.content)}
                </div>
                {m.listingId && (
                  <div className='mt-2'>
                    <a href={`/listing/${m.listingId}`} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      isMine
                        ? 'border-blue-400/50 text-blue-100 hover:bg-blue-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}>
                      <svg xmlns='http://www.w3.org/2000/svg' className='h-3 w-3' viewBox='0 0 20 20' fill='currentColor'>
                        <path d='M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z' />
                      </svg>
                      View Listing
                    </a>
                  </div>
                )}
                <div className={`mt-1.5 text-[10px] flex items-center gap-1 ${isMine ? 'text-blue-200' : 'text-slate-400'}`}>
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {isMine && (
                    <span className={`ml-1 ${m.read ? 'text-cyan-300' : (sendingIds[m._id] ? 'text-blue-300' : 'text-blue-200/60')}`} title={m.read ? 'Seen' : (sendingIds[m._id] ? 'Delivered' : 'Sent')}>
                      {m.read ? '✓✓' : (sendingIds[m._id] ? '✓' : '○')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {peerTyping && (
          <div className='flex justify-start'>
            <div className='bg-white px-4 py-3 rounded-2xl rounded-bl-md shadow-sm border border-slate-100'>
              <div className='flex gap-1'>
                <span className='w-2 h-2 bg-slate-400 rounded-full animate-bounce' style={{ animationDelay: '0ms' }}></span>
                <span className='w-2 h-2 bg-slate-400 rounded-full animate-bounce' style={{ animationDelay: '150ms' }}></span>
                <span className='w-2 h-2 bg-slate-400 rounded-full animate-bounce' style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className='border-t p-3 flex gap-2 bg-white rounded-b-xl'>
        <input
          className='border border-slate-200 rounded-full px-4 py-2.5 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow'
          placeholder='Type a message...'
          value={input}
          onChange={handleTyping}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
        />
        <button
          onClick={send}
          disabled={!input.trim()}
          className='px-5 py-2.5 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2'
        >
          <span>Send</span>
          <svg xmlns='http://www.w3.org/2000/svg' className='h-4 w-4' viewBox='0 0 20 20' fill='currentColor'>
            <path d='M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z' />
          </svg>
        </button>
      </div>
    </div>
  );

  if (isEmbedded) {
    return chatContent;
  }

  return (
    <main className='max-w-3xl mx-auto px-4 py-6'>
      {chatContent}
    </main>
  );
}



