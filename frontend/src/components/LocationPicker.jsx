import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { HiSearch, HiX, HiLocationMarker } from 'react-icons/hi';
import { apiClient } from '../utils/http';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const customIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,' + btoa(`
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="12" fill="#3B82F6" stroke="#FFFFFF" stroke-width="3"/>
      <circle cx="16" cy="16" r="6" fill="#FFFFFF"/>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

function ClickHandler({ onChange }) {
  useMapEvents({ click: (e) => onChange(e.latlng.lat, e.latlng.lng) });
  return null;
}

function FlyToLocation({ lat, lng, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) map.flyTo([lat, lng], zoom || Math.max(map.getZoom(), 14), { duration: 0.8 });
  }, [lat, lng, zoom, map]);
  return null;
}

const DEFAULT_CENTER = [28.6139, 77.209]; // New Delhi

const round = (n) => Math.round(n * 1e6) / 1e6;

/**
 * Pick a lat/lng four ways — search an address, use the device location, type
 * the coordinates, or click the map — because clicking a country-wide map blind
 * is not a way to find one colony. `value` is `{ lat, lng }` or null; `onChange`
 * is called with `(lat, lng)`.
 */
export default function LocationPicker({ value, onChange, defaultCenter = DEFAULT_CENTER, zoom = 13, height = 320 }) {
  const hasValue = value && typeof value.lat === 'number' && typeof value.lng === 'number';
  const center = hasValue ? [value.lat, value.lng] : defaultCenter;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [note, setNote] = useState('');
  const boxRef = useRef(null);
  const debounceRef = useRef(null);
  const seqRef = useRef(0);

  // Close the results dropdown on an outside click.
  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setShowResults(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const runSearch = (q) => {
    clearTimeout(debounceRef.current);
    if (q.trim().length < 3) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++seqRef.current;
      try {
        const res = await apiClient.get(`/geocode/search?q=${encodeURIComponent(q.trim())}&limit=6`, { silent: true });
        if (seq !== seqRef.current) return;
        setResults(res?.data || []);
        setShowResults(true);
      } catch {
        if (seq === seqRef.current) setResults([]);
      } finally {
        if (seq === seqRef.current) setSearching(false);
      }
    }, 350);
  };

  const pick = (r) => {
    onChange(r.lat, r.lng);
    setQuery(r.displayName || r.address || '');
    setShowResults(false);
    setNote('');
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { setNote('This browser cannot share a location.'); return; }
    setGeoBusy(true);
    setNote('');
    navigator.geolocation.getCurrentPosition(
      (pos) => { onChange(round(pos.coords.latitude), round(pos.coords.longitude)); setGeoBusy(false); },
      () => { setNote('Could not get your location — allow location access, or search instead.'); setGeoBusy(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const setCoord = (which, raw) => {
    const n = parseFloat(raw);
    const lat = which === 'lat' ? n : (hasValue ? value.lat : NaN);
    const lng = which === 'lng' ? n : (hasValue ? value.lng : NaN);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      onChange(lat, lng);
    }
  };

  const inputCls =
    'w-full border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors';

  return (
    <div className='space-y-3'>
      {/* Search + use-my-location */}
      <div className='flex flex-col sm:flex-row gap-2'>
        <div className='relative flex-1' ref={boxRef}>
          <HiSearch className='w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2' aria-hidden='true' />
          <input
            type='text'
            value={query}
            onChange={(e) => { setQuery(e.target.value); runSearch(e.target.value); }}
            onFocus={() => results.length && setShowResults(true)}
            placeholder='Search an address, locality or landmark…'
            aria-label='Search for a location'
            className={`${inputCls} pl-9 pr-9`}
          />
          {query && (
            <button type='button' onClick={() => { setQuery(''); setResults([]); setShowResults(false); }}
              aria-label='Clear search' className='absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700'>
              <HiX className='w-4 h-4' aria-hidden='true' />
            </button>
          )}
          {showResults && (results.length > 0 || searching) && (
            <div className='absolute z-[1000] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-64 overflow-y-auto'>
              {searching && results.length === 0 && (
                <div className='px-3 py-2.5 text-sm text-slate-500'>Searching…</div>
              )}
              {results.map((r, i) => (
                <button type='button' key={`${r.lat}-${r.lng}-${i}`} onClick={() => pick(r)}
                  className='w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-start gap-2 border-b border-slate-100 last:border-0'>
                  <HiLocationMarker className='w-4 h-4 text-brand-500 mt-0.5 shrink-0' aria-hidden='true' />
                  <span className='text-sm text-slate-700 leading-snug'>{r.displayName || r.address}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type='button' onClick={useMyLocation} disabled={geoBusy}
          className='inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap'>
          <HiLocationMarker className='w-4 h-4' aria-hidden='true' />{geoBusy ? 'Locating…' : 'Use my location'}
        </button>
      </div>

      {note && <p className='text-xs text-amber-600'>{note}</p>}

      <div className='w-full rounded-lg overflow-hidden border border-slate-200' style={{ height }}>
        <MapContainer center={center} zoom={hasValue ? 15 : zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          />
          <ClickHandler onChange={onChange} />
          {hasValue && <FlyToLocation lat={value.lat} lng={value.lng} />}
          {hasValue && <Marker position={[value.lat, value.lng]} icon={customIcon} />}
        </MapContainer>
      </div>

      {/* Manual coordinates — paste exact lat/lng, or read back what's set. */}
      <div className='flex flex-wrap items-end gap-3'>
        <label className='text-xs text-slate-500'>
          Latitude
          <input type='number' step='any' value={hasValue ? value.lat : ''} onChange={(e) => setCoord('lat', e.target.value)}
            placeholder='28.6139' className={`${inputCls} mt-1 w-36`} aria-label='Latitude' />
        </label>
        <label className='text-xs text-slate-500'>
          Longitude
          <input type='number' step='any' value={hasValue ? value.lng : ''} onChange={(e) => setCoord('lng', e.target.value)}
            placeholder='77.2090' className={`${inputCls} mt-1 w-36`} aria-label='Longitude' />
        </label>
        <p className='text-xs text-slate-400 pb-2'>Search, tap the map, use your location, or type coordinates.</p>
      </div>
    </div>
  );
}
