export function cn(...classes) {
  return classes
    .flatMap((c) => {
      if (!c) return [];
      if (Array.isArray(c)) return c;
      return [c];
    })
    .filter(Boolean)
    .join(' ');
}
