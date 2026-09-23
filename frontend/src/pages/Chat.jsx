import { useEffect, useState, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { createSocket } from '../config/socket';
import { apiClient } from '../utils/http';
import { DEFAULT_AVATAR_URL } from '../utils/avatarPlaceholder';
import { HiPaperAirplane, HiArrowLeft } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** Adds messages not already in the list, by id — the send response and the
 * socket's message:sent can both arrive. */
const mergeMessages = (prev, incoming) => {
  const seen = new Set(prev.map((m) => String(m._id)));
  const fresh = incoming.filter((m) => m && !seen.has(String(m._id)));
  return fresh.length ? [...prev, ...fresh] : prev;
};

export default function Chat({ otherIdProp, otherUserInfo = null, onBack }) {
  const { t } = useTranslation();
  const { currentUser } = useSelector((s) => s.user);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState(otherUserInfo);
  const [sendError, setSendError] = useState('');
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
        (sameId(msg.senderId, otherIdProp) && sameId(msg.receiverId, currentUser?._id)) ||
        (sameId(msg.senderId, currentUser?._id) && sameId(msg.receiverId, otherIdProp))
      ) {
        setMessages((prev) => mergeMessages(prev, [msg]));
        apiClient.post('/message/read', { otherId: otherIdProp }).catch(() => {});
      }
    });
    socket.on('message:sent', (msg) => {
      if (sameId(msg.receiverId, otherIdProp)) setMessages((prev) => mergeMessages(prev, [msg]));
    });
    socketRef.current = socket;

    return () => {
      cancelled = true;
      socket.close();
    };
  }, [otherIdProp, currentUser?._id]);

  // The list already knows who this is; fetch only when opened by link.
  useEffect(() => {
    if (!otherIdProp) return;
    if (otherUserInfo && sameId(otherUserInfo._id, otherIdProp)) {
      setOtherUser(otherUserInfo);
      return;
    }
    setOtherUser(null);
    apiClient.get(`/user/${otherIdProp}`).then((u) => setOtherUser(u)).catch(() => {});
  }, [otherIdProp, otherUserInfo]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError('');
    setText('');
    try {
      // Shown from the response: it used to wait for the socket's echo, so
      // with the socket down a sent message never appeared at all.
      const saved = await apiClient.post('/message/send', { receiverId: otherIdProp, content: trimmed });
      if (saved?._id) setMessages((prev) => mergeMessages(prev, [saved]));
    } catch (err) {
      setText(trimmed);
      setSendError(err?.message || t('chat.sendFailed'));
    }
    setSending(false);
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // A divider whenever the day changes, so "10:42" is never ambiguous.
  const dayLabel = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOf(now) - startOf(d)) / 86400000);
    if (days === 0) return t('chat.today');
    if (days === 1) return t('chat.yesterday');
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  };
  const displayName = [otherUser?.firstName, otherUser?.lastName].filter(Boolean).join(' ').trim() || otherUser?.username || '';

  return (
    <div className='flex flex-col h-[calc(100vh-230px)] bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden'>
      {/* Header */}
      <div className='flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0'>
        {onBack && (
          <button
            type='button'
            onClick={onBack}
            aria-label={t('messages.backToConversations')}
            className='lg:hidden -ml-1 p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100'
          >
            <HiArrowLeft className='w-5 h-5' />
          </button>
        )}
        <img
          src={otherUser?.avatar || DEFAULT_AVATAR_URL}
          alt='avatar'
          className='w-9 h-9 rounded-full object-cover'
        />
        <div>
          <div className='text-sm font-semibold text-slate-800'>
            {displayName || '…'}
          </div>
          {otherUser?.username && displayName !== otherUser.username && (
            <div className='text-xs text-slate-500'>@{otherUser.username}</div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className='flex-1 overflow-y-auto px-4 py-3 space-y-2'>
        {messages.map((msg, i) => {
          const isMe = sameId(msg.senderId, currentUser?._id);
          const prev = messages[i - 1];
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();
          return (
            <div key={msg._id || i}>
            {newDay && (
              <div className='flex justify-center my-3'>
                <span className='text-[11px] font-medium text-slate-500 bg-slate-100 rounded-full px-2.5 py-0.5'>{dayLabel(msg.createdAt)}</span>
              </div>
            )}
            <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
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
            </div>
          );
        })}
        {messages.length === 0 && (
          <div className='flex items-center justify-center h-full'>
            <p className='text-sm text-slate-400'>{t('chat.noMessagesYetSayHello')}</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {sendError && (
        <p role='alert' className='px-4 pt-2 text-xs text-rose-600'>{sendError}</p>
      )}
      {/* Input */}
      <form onSubmit={handleSend} className='flex items-center gap-2 px-4 py-3 border-t border-slate-100 flex-shrink-0'>
        <input
          className='flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all'
          placeholder={t('chat.typeAMessage')}
          value={text}
          onChange={(e) => { setText(e.target.value); if (sendError) setSendError(''); }}
          maxLength={1000}
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
