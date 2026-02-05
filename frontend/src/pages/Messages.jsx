import { useEffect, useState, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { Link, useLocation } from 'react-router-dom';
import Chat from './Chat';
import { createSocket } from '../config/socket';

export default function Messages() {
  // Removed individual inbox/sent lists per request
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [query, setQuery] = useState('');
  const socketRef = useRef(null);
  const { currentUser } = useSelector((s) => s.user);
  const [onlineMap, setOnlineMap] = useState({});
  const location = useLocation();

  // New conversation modal state
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [onlineUsersList, setOnlineUsersList] = useState([]);
  const [loadingOnline, setLoadingOnline] = useState(false);
  const searchTimerRef = useRef(null);

  // Fetch online users when modal opens
  useEffect(() => {
    if (!showNewChat) return;
    (async () => {
      try {
        setLoadingOnline(true);
        const res = await fetch('/api/message/online-users', { credentials: 'include' });
        const data = await res.json();
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
    if (!q.trim() || q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await fetch(`/api/user/search?q=${encodeURIComponent(q.trim())}`, { credentials: 'include' });
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } catch (_) {
        setSearchResults([]);
      }
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
        const cRes = await fetch('/api/message/conversations', { credentials: 'include' });
        const cData = await cRes.json();
        // Ensure conversations is always an array
        setConversations(Array.isArray(cData) ? cData : []);
      } catch (error) {
        console.error('Error loading conversations:', error);
      }
      setLoading(false);
    };
    load();
    const socket = createSocket(currentUser?._id);
    
    socket.on('conversations:update', () => {
      load();
    });
    socket.on('presence:update', ({ userId, online }) => {
      setOnlineMap((m) => ({ ...m, [userId]: online }));
    });
    socket.on('presence:bulk', (ids) => {
      try {
        const map = {};
        (ids || []).forEach((id) => { map[String(id)] = true; });
        setOnlineMap(map);
      } catch (_) {}
    });
    socketRef.current = socket;
    return () => socket.close();
  }, [currentUser?._id]);

  const [activeChatUser, setActiveChatUser] = useState('');

  // Auto-select user from query param (?user=...)
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const userParam = params.get('user');
      if (userParam) setActiveChatUser(userParam);
    } catch (_) {}
  }, [location.search]);

  // Removed Item component used for inbox/sent

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <main className='max-w-6xl mx-auto px-4 py-6'>
      <div className='flex items-center justify-between mb-5'>
        <div>
          <h1 className='text-2xl font-bold text-slate-800'>Messages</h1>
          <p className='text-sm text-slate-500 mt-0.5'>
            {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowNewChat(true)}
          className='flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-full hover:bg-blue-700 transition-all hover:shadow-lg hover:shadow-blue-600/25 font-medium'
        >
          <svg xmlns='http://www.w3.org/2000/svg' className='h-5 w-5' viewBox='0 0 20 20' fill='currentColor'>
            <path fillRule='evenodd' d='M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z' clipRule='evenodd' />
          </svg>
          New Message
        </button>
      </div>

      {/* New Message Modal */}
      {showNewChat && (
        <div className='fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center pt-24' onClick={() => setShowNewChat(false)}>
          <div className='bg-white rounded-xl shadow-2xl w-full max-w-md mx-4' onClick={(e) => e.stopPropagation()}>
            <div className='flex items-center justify-between p-4 border-b'>
              <h2 className='text-lg font-semibold text-slate-800'>New Message</h2>
              <button onClick={() => { setShowNewChat(false); setSearchQuery(''); setSearchResults([]); }} className='text-slate-400 hover:text-slate-600'>
                <svg xmlns='http://www.w3.org/2000/svg' className='h-5 w-5' viewBox='0 0 20 20' fill='currentColor'>
                  <path fillRule='evenodd' d='M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z' clipRule='evenodd' />
                </svg>
              </button>
            </div>
            <div className='p-4'>
              <input
                className='border rounded-lg p-3 w-full focus:outline-none focus:ring-2 focus:ring-blue-500'
                placeholder='Search by name, username, or email...'
                value={searchQuery}
                onChange={(e) => handleUserSearch(e.target.value)}
                autoFocus
              />
              <div className='mt-3 max-h-72 overflow-y-auto'>
                {/* Search results */}
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
                    className='w-full flex items-center gap-3 p-3 rounded-lg hover:bg-blue-50 transition-colors text-left'
                  >
                    <div className='relative'>
                      <img
                        src={u.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
                        alt='avatar'
                        className='w-10 h-10 rounded-full object-cover'
                      />
                      {onlineMap[u._id] && (
                        <span className='absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full' />
                      )}
                    </div>
                    <div>
                      <div className='font-medium text-slate-800'>{u.username}</div>
                      {(u.firstName || u.lastName) && (
                        <div className='text-xs text-slate-500'>{[u.firstName, u.lastName].filter(Boolean).join(' ')}</div>
                      )}
                    </div>
                  </button>
                ))}

                {/* Online users (shown when not searching) */}
                {!searchQuery.trim() && (
                  <>
                    <div className='flex items-center gap-2 px-1 py-2'>
                      <span className='w-2 h-2 bg-green-500 rounded-full' />
                      <span className='text-sm font-medium text-slate-600'>Online Now</span>
                    </div>
                    {loadingOnline && <p className='text-sm text-slate-400 text-center py-3'>Loading...</p>}
                    {!loadingOnline && onlineUsersList.length === 0 && (
                      <p className='text-sm text-slate-400 text-center py-3'>No other users online</p>
                    )}
                    {onlineUsersList.map((u) => (
                      <button
                        key={u._id}
                        onClick={() => startConversation(u._id)}
                        className='w-full flex items-center gap-3 p-3 rounded-lg hover:bg-blue-50 transition-colors text-left'
                      >
                        <div className='relative'>
                          <img
                            src={u.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
                            alt='avatar'
                            className='w-10 h-10 rounded-full object-cover'
                          />
                          <span className='absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full' />
                        </div>
                        <div>
                          <div className='font-medium text-slate-800'>{u.username}</div>
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
        {/* Conversations Sidebar */}
        <section className='lg:col-span-1'>
          <div className='bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden'>
            {/* Search Header */}
            <div className='p-3 border-b border-slate-100 bg-slate-50/50'>
              <div className='relative'>
                <svg xmlns='http://www.w3.org/2000/svg' className='h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' />
                </svg>
                <input
                  className='border border-slate-200 rounded-lg pl-9 pr-3 py-2 w-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow'
                  placeholder='Search conversations...'
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Conversations List */}
            <div className='flex flex-col max-h-[calc(100vh-220px)] overflow-y-auto'>
              {loading && (
                <div className='flex justify-center py-8'>
                  <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600'></div>
                </div>
              )}
              {(loading ? [] : (Array.isArray(conversations) ? conversations : []))
                .filter((c) => {
                  if (!query.trim()) return true;
                  const name = c.otherUser?.username || '';
                  const last = c.lastMessage?.content || '';
                  return (
                    name.toLowerCase().includes(query.toLowerCase()) ||
                    last.toLowerCase().includes(query.toLowerCase())
                  );
                })
                .map((c) => (
                  <button
                    key={c.otherId}
                    onClick={() => setActiveChatUser(c.otherId)}
                    className={`p-3 text-left border-b border-slate-50 flex gap-3 items-center transition-colors ${
                      activeChatUser === c.otherId
                        ? 'bg-blue-50 border-l-4 border-l-blue-600'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className='relative flex-shrink-0'>
                      <img
                        src={c.otherUser?.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
                        alt='avatar'
                        className='w-12 h-12 rounded-full object-cover'
                      />
                      <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${onlineMap[c.otherId] ? 'bg-green-500' : 'bg-slate-300'}`} />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='flex justify-between items-center mb-1'>
                        <span className={`font-semibold text-slate-800 truncate ${c.unread > 0 ? 'text-slate-900' : ''}`}>
                          {c.otherUser?.username || c.otherId}
                        </span>
                        <span className='text-xs text-slate-400 flex-shrink-0 ml-2'>
                          {formatTime(c.lastMessage?.createdAt)}
                        </span>
                      </div>
                      <div className='flex justify-between items-center'>
                        <p className={`text-sm truncate max-w-[180px] ${c.unread > 0 ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>
                          {c.lastMessage?.content || 'No messages'}
                        </p>
                        {c.unread > 0 && (
                          <span className='text-xs bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 ml-2 font-medium'>
                            {c.unread > 9 ? '9+' : c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              {!loading && (!Array.isArray(conversations) || conversations.length === 0) && (
                <div className='text-center py-12 px-4'>
                  <svg xmlns='http://www.w3.org/2000/svg' className='h-12 w-12 mx-auto text-slate-300 mb-3' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1.5} d='M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' />
                  </svg>
                  <p className='text-slate-500 mb-3'>No conversations yet</p>
                  <button onClick={() => setShowNewChat(true)} className='text-blue-600 hover:text-blue-700 text-sm font-medium hover:underline'>
                    Start a new conversation
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Chat Area */}
        <section className='lg:col-span-2'>
          {activeChatUser ? (
            <Chat otherIdProp={activeChatUser} />
          ) : (
            <div className='h-[calc(100vh-180px)] flex flex-col items-center justify-center border rounded-xl bg-white text-slate-400 shadow-sm'>
              <svg xmlns='http://www.w3.org/2000/svg' className='h-20 w-20 mb-4 opacity-50' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1} d='M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' />
              </svg>
              <p className='text-lg font-medium text-slate-500'>Select a conversation</p>
              <p className='text-sm text-slate-400 mt-1'>Choose from your existing conversations or start a new one</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}


