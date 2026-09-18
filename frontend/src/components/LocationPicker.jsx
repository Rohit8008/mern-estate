import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
  useMapEvents({
    click: (e) => onChange(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

function FlyToLocation({ lat, lng, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], zoom || map.getZoom(), { duration: 1 });
    }
  }, [lat, lng, zoom, map]);
  return null;
}

const DEFAULT_CENTER = [28.6139, 77.209]; // New Delhi

/**
 * Click-to-pick lat/lng on a Leaflet map. `value` is `{ lat, lng }` or null/empty.
 */
export default function LocationPicker({ value, onChange, defaultCenter = DEFAULT_CENTER, zoom = 12, height = 280 }) {
  const hasValue = value && typeof value.lat === 'number' && typeof value.lng === 'number';
  const center = hasValue ? [value.lat, value.lng] : defaultCenter;

  return (
    <div className='w-full rounded-lg overflow-hidden border border-slate-200' style={{ height }}>
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        />
        <ClickHandler onChange={onChange} />
        {hasValue && <FlyToLocation lat={value.lat} lng={value.lng} zoom={zoom} />}
        {hasValue && <Marker position={[value.lat, value.lng]} icon={customIcon} />}
      </MapContainer>
    </div>
  );
}
