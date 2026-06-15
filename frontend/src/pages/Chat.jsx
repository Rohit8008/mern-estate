import { useEffect, useState, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { createSocket } from '../config/socket';
import { apiClient } from '../utils/http';
import { HiPaperAirplane } from 'react-icons/hi';

export default function Chat({ otherIdProp }) {
  const { currentUser } = useSelector((s) => s.user);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState(null);
  const socketRef = useRef(null);
  const bottomRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!otherIdProp) return;

    let cancelled = false;

    const load = async () => {
      try {
        const data = await apiClient.get(`/message/thread/${otherIdProp}`);
        if (!cancelled) setMessages(Array.isArray(data) ? data : []);
      } catch (_) {}

      try {
        await apiClient.post('/message/read', { otherId: otherIdProp });
      } catch (_) {}
    };

    load();

    const socket = createSocket(currentUser?._id);
    socket.on('message:new', (msg) => {
      if (
        (msg.senderId === otherIdProp && msg.receiverId === currentUser?._id) ||
        (msg.senderId === currentUser?._id && msg.receiverId === otherIdProp)
      ) {
        setMessages((prev) => [...prev, msg]);
        apiClient.post('/message/read', { otherId: otherIdProp }).catch(() => {});
      }
    });
    socket.on('message:sent', (msg) => {
      if (msg.receiverId === otherIdProp) {
        setMessages((prev) => {
          const alreadyExists = prev.some((m) => m._id === msg._id);
          return alreadyExists ? prev : [...prev, msg];
        });
      }
    });
    socketRef.current = socket;

    return () => {
      cancelled = true;
      socket.close();
    };
  }, [otherIdProp, currentUser?._id]);

  // Fetch other user's profile
  useEffect(() => {
    if (!otherIdProp) return;
    apiClient.get(`/user/${otherIdProp}`).then((u) => setOtherUser(u)).catch(() => {});
  }, [otherIdProp]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    try {
      await apiClient.post('/message/send', { receiverId: otherIdProp, content: trimmed });
    } catch (_) {
      setText(trimmed);
    }
    setSending(false);
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className='flex flex-col h-[calc(100vh-230px)] bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden'>
      {/* Header */}
      <div className='flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0'>
        <img
          src={otherUser?.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
          alt='avatar'
          className='w-9 h-9 rounded-full object-cover'
        />
        <div>
          <div className='text-sm font-semibold text-slate-800'>
            {otherUser?.username || otherIdProp}
          </div>
          {(otherUser?.firstName || otherUser?.lastName) && (
            <div className='text-xs text-slate-500'>
              {[otherUser.firstName, otherUser.lastName].filter(Boolean).join(' ')}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className='flex-1 overflow-y-auto px-4 py-3 space-y-2'>
        {messages.map((msg, i) => {
          const isMe = msg.senderId === currentUser?._id;
          return (
            <div key={msg._id || i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                  isMe
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                }`}
              >
                {msg.content}
                <div className={`text-[10px] mt-1 ${isMe ? 'text-indigo-200 text-right' : 'text-slate-400'}`}>
                  {formatTime(msg.createdAt)}
                </div>
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <div className='flex items-center justify-center h-full'>
            <p className='text-sm text-slate-400'>No messages yet. Say hello!</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className='flex items-center gap-2 px-4 py-3 border-t border-slate-100 flex-shrink-0'>
        <input
          className='flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all'
          placeholder='Type a message...'
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={sending}
        />
        <button
          type='submit'
          disabled={!text.trim() || sending}
          className='w-9 h-9 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex-shrink-0'
        >
          <HiPaperAirplane className='w-4 h-4 rotate-90' />
        </button>
      </form>
    </div>
  );
}
