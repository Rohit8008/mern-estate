/**
 * Parse a free-text plot dimension like `32'6" * 70'6"` into square feet.
 *
 * A plot's size is written as width × length, each in feet (optionally with
 * inches). We accept the separators people actually type — `x`, `X`, `*`, `×`,
 * or the word "by" — and each dimension as:
 *   32'6"   feet + inches   -> 32.5
 *   32' 6   feet + inches (loose quotes)
 *   32.5    decimal feet
 *   30 ft   plain feet
 * Returns square feet (2 dp) or null when it isn't two sensible dimensions, so
 * the caller can leave the area untouched rather than guess.
 */
export function plotSizeToSqFt(text) {
  if (!text) return null;
  const parts = String(text)
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/\bby\b/g, 'x')
    .split(/[x*]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length !== 2) return null;

  const toFeet = (p) => {
    // feet ' inches "  (inches optional), e.g. 32'6"  32' 6  32'
    const fi = p.match(/^(\d+(?:\.\d+)?)\s*'\s*(\d+(?:\.\d+)?)?\s*"?$/);
    if (fi) return parseFloat(fi[1]) + (fi[2] ? parseFloat(fi[2]) / 12 : 0);
    // plain feet, e.g. 30  30.5  30ft  30 feet  30"
    const num = p.match(/^(\d+(?:\.\d+)?)\s*(?:ft|feet|')?\s*"?$/);
    if (num) return parseFloat(num[1]);
    return NaN;
  };

  const w = toFeet(parts[0]);
  const l = toFeet(parts[1]);
  if (!Number.isFinite(w) || !Number.isFinite(l) || w <= 0 || l <= 0) return null;
  return Math.round(w * l * 100) / 100;
}
