import { useState, useEffect } from 'react';
import { HiOutlineWifi, HiOutlineRefresh } from 'react-icons/hi';

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    const handleOffline = () => { setIsOnline(false); setShowBack(false); };
    const handleOnline = () => {
      setIsOnline(true);
      setShowBack(true);
      setTimeout(() => setShowBack(false), 3000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (isOnline && !showBack) return null;

  if (showBack) {
    return (
      <div className='fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-full shadow-lg animate-fade-in'>
        <HiOutlineWifi className='w-4 h-4' />
        Back online
      </div>
    );
  }

  return (
    <div className='fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-500 text-white text-sm font-medium lg:left-64'>
      <div className='flex items-center gap-2'>
        <HiOutlineWifi className='w-4 h-4 flex-shrink-0' />
        <span>You're offline — showing cached data</span>
      </div>
      <button
        type='button'
        onClick={() => window.location.reload()}
        className='flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors text-xs font-semibold'
      >
        <HiOutlineRefresh className='w-3.5 h-3.5' />
        Retry
      </button>
    </div>
  );
}
