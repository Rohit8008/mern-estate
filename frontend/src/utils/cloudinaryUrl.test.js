import { describe, it, expect } from 'vitest';
import { cloudinaryUrl, cloudinarySrcSet } from './cloudinaryUrl';

const BASE = 'https://res.cloudinary.com/demo/image/upload';

describe('cloudinaryUrl', () => {
  it('injects transformations before the version segment', () => {
    expect(cloudinaryUrl(`${BASE}/v123/a/b.jpg`, { w: 400 }))
      .toBe(`${BASE}/f_auto,q_auto,c_limit,w_400/v123/a/b.jpg`);
  });
  it('injects when there is no version (folder path)', () => {
    expect(cloudinaryUrl(`${BASE}/my_folder/b.jpg`, { w: 800 }))
      .toBe(`${BASE}/f_auto,q_auto,c_limit,w_800/my_folder/b.jpg`);
  });
  it('is idempotent', () => {
    const once = cloudinaryUrl(`${BASE}/v1/x.jpg`, { w: 400 });
    expect(cloudinaryUrl(once, { w: 400 })).toBe(once);
  });
  it('leaves existing transformations alone', () => {
    const u = `${BASE}/w_100,h_100,c_fill/v1/x.jpg`;
    expect(cloudinaryUrl(u, { w: 400 })).toBe(u);
  });
  it('leaves non-Cloudinary, video, empty and bad-width input untouched', () => {
    expect(cloudinaryUrl('/uploads/a.jpg', { w: 400 })).toBe('/uploads/a.jpg');
    expect(cloudinaryUrl('https://example.com/image/upload/a.jpg', { w: 400 })).toBe('https://example.com/image/upload/a.jpg');
    const v = 'https://res.cloudinary.com/demo/video/upload/v1/a.mp4';
    expect(cloudinaryUrl(v, { w: 400 })).toBe(v);
    expect(cloudinaryUrl('', { w: 400 })).toBe('');
    expect(cloudinaryUrl(undefined, { w: 400 })).toBeUndefined();
    expect(cloudinaryUrl(`${BASE}/v1/x.jpg`, {})).toBe(`${BASE}/v1/x.jpg`);
  });
});

describe('cloudinarySrcSet', () => {
  it('builds a srcset for Cloudinary and undefined otherwise', () => {
    expect(cloudinarySrcSet(`${BASE}/v1/x.jpg`, [400, 800])).toBe(
      `${BASE}/f_auto,q_auto,c_limit,w_400/v1/x.jpg 400w, ${BASE}/f_auto,q_auto,c_limit,w_800/v1/x.jpg 800w`
    );
    expect(cloudinarySrcSet('/uploads/a.jpg', [400, 800])).toBeUndefined();
  });
});
