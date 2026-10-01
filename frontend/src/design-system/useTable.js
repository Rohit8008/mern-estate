import { useCallback, useMemo, useState } from 'react';

/**
 * Compare two cell values for sorting. Empty values sort last in both
 * directions — nobody sorting by "due date" wants the undated tasks first.
 * Strings compare with numeric collation, so "Unit 9" comes before "Unit 10".
 */
export function compareValues(a, b) {
  const empty = (v) => v === null || v === undefined || v === '';
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1;
  if (empty(b)) return -1;
  if (a instanceof Date || b instanceof Date) return new Date(a) - new Date(b);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Client-side sorting for a list already in hand. For a server-paged list,
 * keep `sort`/`toggle` and send `sort` to the API instead of using `sorted`:
 * sorting one page of results is sorting the wrong set.
 *
 * `accessors` maps a sort key to how to read it off a row, for when the column
 * is not a plain field (`{ owner: (r) => r.owner?.name }`).
 *
 * Clicking a column sorts ascending, again descending, a third time clears.
 */
export function useTableSort(rows, { initial = null, accessors = {} } = {}) {
  const [sort, setSort] = useState(initial);

  const toggle = useCallback((key) => {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: 'asc' };
      if (s.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }, []);

  const sorted = useMemo(() => {
    if (!sort || !Array.isArray(rows)) return rows;
    const read = accessors[sort.key] || ((r) => r?.[sort.key]);
    const factor = sort.dir === 'desc' ? -1 : 1;
    // Empty values stay last whichever way the column is sorted, so the
    // direction only applies when both sides have a value.
    return [...rows].sort((x, y) => {
      const a = read(x);
      const b = read(y);
      const c = compareValues(a, b);
      const bothPresent = ![a, b].some((v) => v === null || v === undefined || v === '');
      return bothPresent ? c * factor : c;
    });
    // `accessors` is usually an inline object; keying on the sort alone keeps
    // the memo stable instead of re-sorting every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  return { sorted, sort, setSort, toggle };
}

/**
 * Checkbox selection over a list of ids. Selection that has scrolled out of
 * the current filter is dropped, so a bulk action never touches rows the user
 * can no longer see.
 */
export function useRowSelection(ids) {
  const [picked, setPicked] = useState(() => new Set());

  const visible = useMemo(() => new Set(ids), [ids]);
  const selected = useMemo(
    () => new Set([...picked].filter((id) => visible.has(id))),
    [picked, visible]
  );

  const toggle = useCallback((id) => {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const allState = selected.size === 0 ? 'none' : selected.size === visible.size ? 'all' : 'some';

  const toggleAll = useCallback(() => {
    setPicked(allState === 'all' ? new Set() : new Set(visible));
  }, [allState, visible]);

  const clear = useCallback(() => setPicked(new Set()), []);

  return {
    selected,
    count: selected.size,
    isSelected: (id) => selected.has(id),
    toggle,
    toggleAll,
    clear,
    allState,
    /** Props for the header checkbox. */
    headerCheckbox: {
      checked: allState === 'all',
      indeterminate: allState === 'some',
      onChange: toggleAll,
      disabled: visible.size === 0,
    },
  };
}
