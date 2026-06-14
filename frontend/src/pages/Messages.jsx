import { useEffect, useState, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import Chat from './Chat';
import { createSocket } from '../config/socket';
import { apiClient } from '../utils/http';
import { PageHeader, Button } from '../design-system';
import { HiPlus, HiX, HiSearch } from 'react-icons/hi';

export default function Messages() {
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [query, setQuery] = useState('');
  const socketRef = useRef(null);
  const convLoadTimerRef = useRef(null);
  const { currentUser } = useSelector((s) => s.user);
  const [onlineMap, setOnlineMap] = useState({});
  const location = useLocation();

  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [onlineUsersList, setOnlineUsersList] = useState([]);
  const [loadingOnline, setLoadingOnline] = useState(false);
  const searchTimerRef = useRef(null);

  const [activeChatUser, setActiveChatUser] = useState('');

  useEffect(() => {
    if (!showNewChat) return;
    (async () => {
      try {
        setLoadingOnline(true);
        const data = await apiClient.get('/message/online-users');
        setOnlineUsersList(Array.isArray(data) ? data : []);
      } catch (_) {
        setOnlineUsersList([]);
      }
      setLoadingOnline(false);
    })();
  }, [showNewChat]);

  const handleUserSearch = useCallback((q) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim() || q.trim().length < 2) { setSearchResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const data = await apiClient.get(`/user/search?q=${encodeURIComponent(q.trim())}`);
        setSearchResults(Array.isArray(data) ? data : []);
      } catch (_) { setSearchResults([]); }
      setSearching(false);
    }, 300);
  }, []);

  const startConversation = (userId) => {
    setActiveChatUser(userId);
    setShowNewChat(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const cData = await apiClient.get('/message/conversations');
        setConversations(Array.isArray(cData) ? cData : []);
      } catch (_) {}
      setLoading(false);
    };
    load();
    const socket = createSocket(currentUser?._id);
    socket.on('conversations:update', () => {
      clearTimeout(convLoadTimerRef.current);
      convLoadTimerRef.current = setTimeout(load, 600);
    });
    socket.on('presence:update', ({ userId, online }) => setOnlineMap((m) => ({ ...m, [userId]: online })));
    socket.on('presence:bulk', (ids) => {
      try {
        const map = {};
        (ids || []).forEach((id) => { map[String(id)] = true; });
        setOnlineMap(map);
      } catch (_) {}
    });
    socketRef.current = socket;
    return () => {
      socket.close();
      clearTimeout(convLoadTimerRef.current);
    };
  }, [currentUser?._id]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const userParam = params.get('user');
      if (userParam) setActiveChatUser(userParam);
    } catch (_) {}
  }, [location.search]);

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return 'Yesterday';
    if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const filtered = (Array.isArray(conversations) ? conversations : []).filter((c) => {
    if (!query.trim()) return true;
    const name = c.otherUser?.username || '';
    const last = c.lastMessage?.content || '';
    return name.toLowerCase().includes(query.toLowerCase()) || last.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Messages'
        description={`${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}`}
        actions={
          <Button variant='primary' size='sm' icon={HiPlus} onClick={() => setShowNewChat(true)}>
            New message
          </Button>
        }
      />

      {/* New Message Modal */}
      {showNewChat && (
        <div
          className='fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center pt-24'
          onClick={() => setShowNewChat(false)}
        >
          <div className='bg-white rounded-xl shadow-2xl w-full max-w-md mx-4' onClick={(e) => e.stopPropagation()}>
            <div className='flex items-center justify-between px-4 py-3 border-b border-slate-100'>
              <h2 className='text-base font-semibold text-slate-800'>New Message</h2>
              <button
                onClick={() => { setShowNewChat(false); setSearchQuery(''); setSearchResults([]); }}
                className='p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors'
              >
                <HiX className='w-4 h-4' />
              </button>
            </div>
            <div className='p-4'>
              <div className='relative'>
                <HiSearch className='w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400' />
                <input
                  className='w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all'
                  placeholder='Search by name, username, or email...'
                  value={searchQuery}
                  onChange={(e) => handleUserSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div className='mt-3 max-h-72 overflow-y-auto'>
                {searching && <p className='text-sm text-slate-500 text-center py-4'>Searching...</p>}
                {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                  <p className='text-sm text-slate-500 text-center py-4'>No users found</p>
                )}
                {!searching && searchQuery.trim().length > 0 && searchQuery.trim().length < 2 && (
                  <p className='text-sm text-slate-400 text-center py-4'>Type at least 2 characters to search</p>
                )}
                {searchResults.map((u) => (
                  <button
                    key={u._id}
                    onClick={() => startConversation(u._id)}
                    className='w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left'
                  >
                    <div className='relative'>
                      <img src={u.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'} alt='avatar' className='w-9 h-9 rounded-full object-cover' />
                      {onlineMap[u._id] && <span className='absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full' />}
                    </div>
                    <div>
                      <div className='text-sm font-medium text-slate-800'>{u.username}</div>
                      {(u.firstName || u.lastName) && (
                        <div className='text-xs text-slate-500'>{[u.firstName, u.lastName].filter(Boolean).join(' ')}</div>
                      )}
                    </div>
                  </button>
                ))}
                {!searchQuery.trim() && (
                  <>
                    <div className='flex items-center gap-2 px-1 py-2'>
                      <span className='w-2 h-2 bg-emerald-500 rounded-full' />
                      <span className='text-xs font-semibold text-slate-500 uppercase tracking-wide'>Online Now</span>
                    </div>
                    {loadingOnline && <p className='text-sm text-slate-400 text-center py-3'>Loading...</p>}
                    {!loadingOnline && onlineUsersList.length === 0 && (
                      <p className='text-sm text-slate-400 text-center py-3'>No other users online</p>
                    )}
                    {onlineUsersList.map((u) => (
                      <button
                        key={u._id}
                        onClick={() => startConversation(u._id)}
                        className='w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left'
                      >
                        <div className='relative'>
                          <img src={u.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'} alt='avatar' className='w-9 h-9 rounded-full object-cover' />
                          <span className='absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full' />
                        </div>
                        <div>
                          <div className='text-sm font-medium text-slate-800'>{u.username}</div>
                          {(u.firstName || u.lastName) && (
                            <div className='text-xs text-slate-500'>{[u.firstName, u.lastName].filter(Boolean).join(' ')}</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
        {/* Conversations sidebar */}
        <section className='lg:col-span-1'>
          <div className='bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm'>
            <div className='p-3 border-b border-slate-100'>
              <div className='relative'>
                <HiSearch className='w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400' />
                <input
                  className='w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all'
                  placeholder='Search conversations...'
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            <div className='flex flex-col max-h-[calc(100vh-270px)] overflow-y-auto'>
              {loading && (
                <div className='flex justify-center py-8'>
                  <div className='animate-spin rounded-full h-5 w-5 border-b-2 border-slate-400' />
                </div>
              )}
              {filtered.map((c) => (
                <button
                  key={c.otherId}
                  onClick={() => setActiveChatUser(c.otherId)}
                  className={`p-3 text-left border-b border-slate-50 flex gap-3 items-center transition-colors ${
                    activeChatUser === c.otherId
                      ? 'bg-indigo-50 border-l-4 border-l-indigo-600'
                      : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                  }`}
                >
                  <div className='relative flex-shrink-0'>
                    <img
                      src={c.otherUser?.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
                      alt='avatar'
                      className='w-10 h-10 rounded-full object-cover'
                    />
                    <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${onlineMap[c.otherId] ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  </div>
                  <div className='flex-1 min-w-0'>
                    <div className='flex justify-between items-center mb-0.5'>
                      <span className='text-sm font-semibold text-slate-800 truncate'>
                        {c.otherUser?.username || c.otherId}
                      </span>
                      <span className='text-xs text-slate-400 flex-shrink-0 ml-2'>
                        {formatTime(c.lastMessage?.createdAt)}
                      </span>
                    </div>
                    <div className='flex justify-between items-center'>
                      <p className={`text-xs truncate max-w-[160px] ${c.unread > 0 ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                        {c.lastMessage?.content || 'No messages'}
                      </p>
                      {c.unread > 0 && (
                        <span className='text-xs bg-indigo-600 text-white rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0 ml-2 font-medium'>
                          {c.unread > 9 ? '9+' : c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {!loading && filtered.length === 0 && (
                <div className='text-center py-10 px-4'>
                  <div className='w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3'>
                    <HiSearch className='w-5 h-5 text-slate-400' />
                  </div>
                  <p className='text-sm text-slate-500 mb-2'>No conversations yet</p>
                  <button onClick={() => setShowNewChat(true)} className='text-indigo-600 hover:text-indigo-700 text-sm font-medium hover:underline'>
                    Start a new conversation
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Chat area */}
        <section className='lg:col-span-2'>
          {activeChatUser ? (
            <Chat otherIdProp={activeChatUser} />
          ) : (
            <div className='h-[calc(100vh-230px)] flex flex-col items-center justify-center border border-slate-200 rounded-xl bg-white shadow-sm'>
              <div className='w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4'>
                <HiSearch className='w-7 h-7 text-slate-400' />
              </div>
              <p className='text-base font-semibold text-slate-600'>Select a conversation</p>
              <p className='text-sm text-slate-400 mt-1'>Choose from your existing conversations or start a new one</p>
              <button onClick={() => setShowNewChat(true)} className='mt-4 text-indigo-600 hover:text-indigo-700 text-sm font-medium hover:underline'>
                Start new message
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
