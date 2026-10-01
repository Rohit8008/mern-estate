import { useEffect, useState } from 'react';

function cx(...xs) { return xs.filter(Boolean).join(' '); }

const SIZE = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
};

function initialsOf(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * A person's picture, or their initials when there is none — or when the
 * picture fails to load, which a broken Cloudinary URL otherwise shows as the
 * browser's torn-image icon.
 *
 * `src` is expected to be normalised already (normalizeImageUrl) — the design
 * system does not know about the API.
 */
export default function Avatar({ src, name, size = 'sm', className }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);

  return (
    <span
      className={cx(
        'inline-flex items-center justify-center flex-shrink-0 overflow-hidden rounded-lg',
        'bg-brand-100 text-brand-700 font-bold ring-1 ring-black/5 select-none',
        SIZE[size],
        className
      )}
    >
      {src && !failed ? (
        <img src={src} alt='' onError={() => setFailed(true)} className='w-full h-full object-cover' />
      ) : (
        <span aria-hidden='true'>{initialsOf(name)}</span>
      )}
    </span>
  );
}
