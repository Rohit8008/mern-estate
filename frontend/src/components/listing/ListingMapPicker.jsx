import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  HiOutlineLocationMarker,
  HiOutlineMinus,
  HiOutlinePlus,
  HiOutlineRefresh,
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

/**
 * Placing a property on the map.
 *
 * The icon, the tile layers, the click handler, the fly-to and the zoom
 * controls all existed twice — once in CreateListing, once in UpdateListing —
 * and had drifted: the edit form was missing the layer switcher and the
 * fit-to-location control entirely, so the same job was easier on one screen
 * than the other for no reason anyone chose.
 */

// Leaflet's default marker images resolve relative to the CSS, which a bundler
// rewrites — hence pointing them at a CDN explicitly.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// With no pin yet, show the whole country rather than a Delhi street: a
// zoomed-in city view read as if the property had already been placed there.
export const DEFAULT_CENTER = [22.5, 79.0];
const DEFAULT_ZOOM = 5;

const MARKER_ICON = new L.Icon({
  iconUrl:
    'data:image/svg+xml;base64,' +
    btoa(`
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="12" fill="#2b6faa" stroke="#FFFFFF" stroke-width="3"/>
      <circle cx="16" cy="16" r="5" fill="#FFFFFF"/>
    </svg>
  `),
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

export const TILE_LAYERS = {
  street: {
    label: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  },
  terrain: {
    label: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  },
};

function ClickToPlace({ onSelect }) {
  useMapEvents({
    click: (e) => onSelect(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

function FlyTo({ lat, lng, zoom = 16 }) {
  const map = useMap();
  useEffect(() => {
    if (typeof lat === 'number' && typeof lng === 'number') {
      map.flyTo([lat, lng], zoom, { duration: 1 });
    }
  }, [lat, lng, zoom, map]);
  return null;
}

function MapControls({ location }) {
  const map = useMap();
  const hasPin = typeof location?.lat === 'number' && typeof location?.lng === 'number';

  const button = (onClick, title, Icon, first = false) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`w-9 h-9 flex items-center justify-center bg-white hover:bg-slate-50 transition-colors ${
        first ? '' : 'border-t border-slate-200'
      }`}
    >
      <Icon className="w-4 h-4 text-slate-600" />
    </button>
  );

  return (
    <div className="leaflet-control-container">
      <div className="leaflet-top leaflet-right">
        <div className="leaflet-control leaflet-bar rounded-lg shadow-md border border-slate-200 overflow-hidden">
          {button(() => map.zoomIn(), 'Zoom in', HiOutlinePlus, true)}
          {button(() => map.zoomOut(), 'Zoom out', HiOutlineMinus)}
          {button(() => map.setView(DEFAULT_CENTER, DEFAULT_ZOOM), 'Reset view', HiOutlineRefresh)}
          {hasPin &&
            button(
              () => map.setView([location.lat, location.lng], 16),
              'Centre on this property',
              HiOutlineLocationMarker
            )}
        </div>
      </div>
    </div>
  );
}

/**
 * @param {object}   location   { lat, lng } or null
 * @param {Function} onSelect   (lat, lng) => void, on click or drag
 * @param {string}   layer      key of TILE_LAYERS
 * @param {Function} onLayer    (key) => void
 * @param {string}   height     Tailwind height class
 */
export default function ListingMapPicker({
  location,
  onSelect,
  layer = 'street',
  onLayer,
  height = 'h-80',
  className = '',
}) {
  const { t } = useTranslation();
  const hasPin = typeof location?.lat === 'number' && typeof location?.lng === 'number';
  const center = hasPin ? [location.lat, location.lng] : DEFAULT_CENTER;
  const tiles = TILE_LAYERS[layer] || TILE_LAYERS.street;

  return (
    // isolate: Leaflet's panes and controls (z-index up to 1000) stay inside
    // this box, so they cannot draw over sticky page chrome like the form's
    // Save bar.
    <div className={`relative isolate rounded-xl overflow-hidden border border-slate-200 ${className}`}>
      {onLayer && (
        // Above Leaflet's own panes (z-index 400–800) but below any modal.
        <div className="absolute top-3 left-3 z-[500] flex rounded-lg overflow-hidden shadow-md border border-slate-200">
          {Object.entries(TILE_LAYERS).map(([key, def]) => (
            <button
              key={key}
              type="button"
              onClick={() => onLayer(key)}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                layer === key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {def.label}
            </button>
          ))}
        </div>
      )}

      <MapContainer
        center={center}
        zoom={hasPin ? 16 : DEFAULT_ZOOM}
        zoomControl={false}
        className={`${height} w-full`}
      >
        <TileLayer url={tiles.url} attribution={tiles.attribution} />
        <ClickToPlace onSelect={onSelect} />
        {hasPin && <FlyTo lat={location.lat} lng={location.lng} />}
        {hasPin && (
          <Marker
            position={[location.lat, location.lng]}
            icon={MARKER_ICON}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const { lat, lng } = e.target.getLatLng();
                onSelect(lat, lng);
              },
            }}
          />
        )}
        <MapControls location={location} />
      </MapContainer>

      {!hasPin && (
        <div className="absolute inset-x-0 bottom-0 z-[500] bg-slate-900/80 text-white text-xs px-3 py-2 text-center pointer-events-none">{t('listingMapPicker.clickTheMapToPlaceThis')}</div>
      )}
    </div>
  );
}
