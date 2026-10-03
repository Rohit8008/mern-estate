import { describe, it, expect } from 'vitest';
import { timeAgo, describeUserAgent, describeReason } from './adminFormat';

const NOW = new Date('2026-10-04T12:00:00Z').getTime();

describe('timeAgo', () => {
  it('reads recent times in words', () => {
    expect(timeAgo(NOW - 10_000, NOW)).toBe('just now');
    expect(timeAgo(NOW - 5 * 60_000, NOW)).toBe('5 min ago');
    expect(timeAgo(NOW - 3 * 3_600_000, NOW)).toBe('3 h ago');
    expect(timeAgo(NOW - 2 * 86_400_000, NOW)).toBe('2 d ago');
  });
  it('falls back to a date after a month, and a dash for nothing', () => {
    expect(timeAgo(NOW - 60 * 86_400_000, NOW)).toMatch(/\d/);
    expect(timeAgo(null, NOW)).toBe('—');
    expect(timeAgo('garbage', NOW)).toBe('—');
  });
});

describe('describeUserAgent', () => {
  it('names the browser and the system', () => {
    expect(describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')).toBe('Chrome on macOS');
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0')).toBe('Edge on Windows');
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iOS');
    expect(describeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0')).toBe('Firefox on Linux');
  });
  it('recognises the mobile app and tools, and survives nothing', () => {
    expect(describeUserAgent('Dart/3.5 (dart:io)')).toBe('Mobile app');
    expect(describeUserAgent('curl/8.1.2')).toBe('curl');
    expect(describeUserAgent('')).toBe('—');
  });
});

describe('describeReason', () => {
  it('translates the known codes and tidies the rest', () => {
    expect(describeReason('Successful login')).toBe('Signed in');
    expect(describeReason('phone_changed:+9198')).toBe('Phone number changed');
    expect(describeReason('too_many_attempts')).toBe('Too many attempts');
    expect(describeReason('')).toBe('—');
  });
});
