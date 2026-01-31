import { useEffect, useState, useRef } from 'react';
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

  return (
    <main className='max-w-6xl mx-auto px-4 py-8'>
      <h1 className='text-3xl font-bold text-slate-800 mb-6'>Messages</h1>
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        <section className='lg:col-span-1'>
          <div className='bg-white rounded-xl shadow p-4'>
            <div className='flex items-center gap-2 mb-3'>
              <input
                className='border rounded-lg p-2 w-full'
                placeholder='Search conversations...'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className='flex flex-col gap-2 max-h-[60vh] overflow-y-auto'>
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
                    className={`border rounded-lg p-3 text-left hover:shadow flex gap-3 items-center ${
                      activeChatUser === c.otherId ? 'bg-blue-50 border-blue-200' : 'bg-white'
                    }`}
                  >
                    <img
                      src={c.otherUser?.avatar || 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'}
                      alt='avatar'
                      className='w-10 h-10 rounded-full object-cover'
                    />
                    <div className='flex-1'>
                      <div className='flex justify-between items-center'>
                        <div className='flex items-center gap-2'>
                          <div className='font-semibold'>{c.otherUser?.username || c.otherId}</div>
                          <span className={`inline-block w-2 h-2 rounded-full ${onlineMap[c.otherId] ? 'bg-green-500' : 'bg-slate-300'}`} />
                        </div>
                        {c.unread > 0 && (
                          <span className='text-xs bg-red-600 text-white rounded-full px-2'>{c.unread}</span>
                        )}
                      </div>
                      <div className='text-xs text-slate-500 mt-1 flex justify-between'>
                        <span>{new Date(c.lastMessage?.createdAt).toLocaleTimeString()}</span>
                        <span className='truncate max-w-[55%]'>{c.lastMessage?.content}</span>
                      </div>
                    </div>
                  </button>
                ))}
              {!loading && (!Array.isArray(conversations) || conversations.length === 0) && (
                <p className='text-slate-600'>No conversations</p>
              )}
            </div>
          </div>
          {/* Inbox/Sent removed */}
        </section>

        <section className='lg:col-span-2'>
          {activeChatUser ? (
            <Chat otherIdProp={activeChatUser} />
          ) : (
            <div className='h-[72vh] flex items-center justify-center border rounded-xl bg-white text-slate-500'>
              Select a conversation to start chatting
            </div>
          )}
        </section>
      </div>
    </main>
  );
}


