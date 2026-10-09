import { describe, it, expect } from 'vitest';
import { plotSizeToSqFt } from '../plotSize';

describe('plotSizeToSqFt', () => {
  it('parses feet + inches with various separators', () => {
    expect(plotSizeToSqFt(`32'6" * 70'6"`)).toBe(2291.25); // 32.5 × 70.5
    expect(plotSizeToSqFt(`32'6" x 70'6"`)).toBe(2291.25);
    expect(plotSizeToSqFt(`32'6" × 70'6"`)).toBe(2291.25);
  });

  it('parses plain and decimal feet', () => {
    expect(plotSizeToSqFt('30 x 50')).toBe(1500);
    expect(plotSizeToSqFt('30x50')).toBe(1500);
    expect(plotSizeToSqFt('32.5 * 70.5')).toBe(2291.25);
    expect(plotSizeToSqFt('30 by 40')).toBe(1200);
  });

  it('returns null for things that are not two dimensions', () => {
    expect(plotSizeToSqFt('')).toBeNull();
    expect(plotSizeToSqFt('corner plot')).toBeNull();
    expect(plotSizeToSqFt('30')).toBeNull();
    expect(plotSizeToSqFt('30 x 0')).toBeNull();
  });
});
