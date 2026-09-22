import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  HiOutlineLockClosed,
  HiOutlineLocationMarker,
  HiOutlineMail,
  HiOutlinePhone,
  HiOutlineClock,
  HiOutlineExclamationCircle,
} from 'react-icons/hi';
import { API_BASE_URL, normalizeImageUrl } from '../utils/http';
import { formatCurrency, formatDate } from '../utils/currency';
import { useTranslation } from 'react-i18next';

/**
 * What a buyer sees when an agent sends them properties.
 *
 * This is the only page in the product a stranger can reach, and it is
 * deliberately narrow: the properties on this link and nothing else. No search,
 * no navigation into the rest of the book, no sign-in prompt — someone sent a
 * shortlist, and this shows the shortlist.
 *
 * It fetches directly rather than through `apiClient` because apiClient carries
 * the session-refresh machinery, and a recipient has no session to refresh.
 */

function cx(...xs) {
  return xs.filter(Boolean).join(' ');
}

function formatPrice(amount) {
  if (!amount) return null;
  return formatCurrency(amount);
}

function PropertyCard({ property, brand }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const images = (property.imageUrls || []).map(normalizeImageUrl);
  const price = formatPrice(property.offer ? property.discountPrice : property.regularPrice);

  const facts = [
    property.bedrooms ? `${property.bedrooms} BHK` : null,
    property.bathrooms ? `${property.bathrooms} bath` : null,
    property.sqYard ? `${property.sqYard} sq yd` : null,
    property.areaSqFt ? `${property.areaSqFt} sq ft` : null,
    property.plotSize || null,
    property.furnished ? 'Furnished' : null,
    property.parking ? 'Parking' : null,
  ].filter(Boolean);

  return (
    <article className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {images.length > 0 ? (
        <div className="relative aspect-[16/10] bg-slate-100">
          <img src={images[active]} alt={property.name} className="w-full h-full object-cover" />
          {images.length > 1 && (
            <div className="absolute inset-x-0 bottom-0 flex gap-1.5 p-3 overflow-x-auto">
              {images.map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Photo ${i + 1}`}
                  className={cx(
                    'w-12 h-9 rounded-md overflow-hidden flex-shrink-0 ring-2 transition-all',
                    i === active ? 'ring-white' : 'ring-white/40 opacity-70 hover:opacity-100'
                  )}
                >
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="aspect-[16/10] bg-slate-100 flex items-center justify-center">
          <span className="text-sm text-slate-400">{t('sharedProperties.noPhotos')}</span>
        </div>
      )}

      <div className="p-5">
        <h2 className="text-lg font-semibold text-slate-900">{property.name}</h2>

        {(property.address || property.locality || property.city) && (
          <p className="flex items-start gap-1.5 text-sm text-slate-500 mt-1">
            <HiOutlineLocationMarker className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              {[property.address, property.areaName, property.locality, property.city]
                .filter(Boolean)
                .join(', ')}
            </span>
          </p>
        )}

        {price && (
          <p className="text-xl font-bold mt-3" style={{ color: brand }}>
            {price}
            {property.type === 'rent' && <span className="text-sm font-normal text-slate-500"> / month</span>}
          </p>
        )}

        {facts.length > 0 && (
          <ul className="flex flex-wrap gap-2 mt-3">
            {facts.map((f) => (
              <li key={f} className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                {f}
              </li>
            ))}
          </ul>
        )}

        {property.description && (
          <p className="text-sm text-slate-600 mt-3 leading-relaxed whitespace-pre-line">
            {property.description}
          </p>
        )}
      </div>
    </article>
  );
}

export default function SharedProperties() {
  const { t } = useTranslation();
  const { token } = useParams();
  const [state, setState] = useState({ status: 'loading' });
  const [passcode, setPasscode] = useState('');
  const [checking, setChecking] = useState(false);

  const load = useCallback(
    async (code) => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/share/open/${encodeURIComponent(token)}`, {
          headers: code ? { 'x-share-passcode': code } : {},
        });
        const body = await res.json().catch(() => null);

        if (res.ok && body?.data) return setState({ status: 'ready', data: body.data });
        if (body?.passcodeRequired) return setState({ status: 'passcode', message: body.message });
        if (body?.expired) return setState({ status: 'gone', message: body.message });
        return setState({ status: 'invalid', message: body?.message || 'This link is not valid.' });
      } catch (_) {
        setState({ status: 'invalid', message: 'Could not reach the agency. Check your connection and try again.' });
      }
    },
    [token]
  );

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (state.status === 'passcode') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setChecking(true);
            await load(passcode);
            setChecking(false);
          }}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-sm w-full"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mx-auto">
            <HiOutlineLockClosed className="w-5 h-5 text-slate-500" />
          </div>
          <h1 className="text-base font-semibold text-slate-900 text-center mt-3">{t('sharedProperties.enterThePasscode')}</h1>
          <p className="text-sm text-slate-500 text-center mt-1">{state.message}</p>
          <input
            autoFocus
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full mt-4 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            placeholder={t('sharedProperties.passcode')}
          />
          <button
            type="submit"
            disabled={checking || !passcode}
            className="w-full mt-3 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium disabled:opacity-50"
          >
            {checking ? 'Checking…' : 'View properties'}
          </button>
        </form>
      </div>
    );
  }

  if (state.status === 'gone' || state.status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="text-center max-w-sm">
          <HiOutlineExclamationCircle className="w-10 h-10 text-slate-300 mx-auto" />
          <h1 className="text-base font-semibold text-slate-900 mt-3">{state.message}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('sharedProperties.askTheAgentWhoSentIt')}</p>
        </div>
      </div>
    );
  }

  const { agency, properties, message, label, expiresAt } = state.data;
  const brand = agency?.tokens?.brand || '#0f172a';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          {agency.logoUrl ? (
            <img src={normalizeImageUrl(agency.logoUrl)} alt="" className="h-8 w-auto" />
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ background: brand }}
            >
              {agency.name.charAt(0)}
            </div>
          )}
          <span className="font-semibold text-slate-900">{agency.name}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {label || `${properties.length} propert${properties.length === 1 ? 'y' : 'ies'} for you`}
          </h1>
          {message && <p className="text-sm text-slate-600 mt-1.5 whitespace-pre-line">{message}</p>}
          {expiresAt && (
            <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-2">
              <HiOutlineClock className="w-3.5 h-3.5" />
              This link works until {formatDate(expiresAt)}
            </p>
          )}
        </div>

        {properties.map((p) => (
          <PropertyCard key={p.id} property={p} brand={brand} />
        ))}

        {(agency.supportPhone || agency.supportEmail) && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
            <p className="text-sm text-slate-600">{t('sharedProperties.interestedOrWantToSeeSomething')}</p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              {agency.supportPhone && (
                <a
                  href={`tel:${agency.supportPhone}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
                  style={{ background: brand }}
                >
                  <HiOutlinePhone className="w-4 h-4" />
                  {agency.supportPhone}
                </a>
              )}
              {agency.supportEmail && (
                <a
                  href={`mailto:${agency.supportEmail}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700"
                >
                  <HiOutlineMail className="w-4 h-4" />{t('sharedProperties.emailUs')}</a>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 pb-6">
          Shared privately by {agency.name}. Please don&rsquo;t forward this link.
        </p>
      </main>
    </div>
  );
}
