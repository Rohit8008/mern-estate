/**
 * Sorting, selection and paging are shared by every list screen, so their edge
 * cases are everyone's: empty values, mixed-number strings, selection that has
 * been filtered out of view.
 */

import { describe, it, expect } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { compareValues, useTableSort, useRowSelection } from '../useTable';
import { pageRange } from '../pageRange';
import { Table, Thead, Th, Tbody, Tr } from '../Table';

describe('compareValues', () => {
  it('compares strings with numeric collation', () => {
    expect(compareValues('Unit 9', 'Unit 10')).toBeLessThan(0);
  });

  it('puts empty values last', () => {
    expect(compareValues(null, 'a')).toBeGreaterThan(0);
    expect(compareValues('', 5)).toBeGreaterThan(0);
    expect(compareValues(undefined, null)).toBe(0);
  });
});

describe('useTableSort', () => {
  const rows = [
    { id: 1, name: 'Bravo', price: 300 },
    { id: 2, name: 'alpha', price: null },
    { id: 3, name: 'Charlie', price: 100 },
  ];

  it('cycles ascending → descending → off', () => {
    const { result } = renderHook(() => useTableSort(rows));
    act(() => result.current.toggle('name'));
    expect(result.current.sorted.map((r) => r.id)).toEqual([2, 1, 3]);
    act(() => result.current.toggle('name'));
    expect(result.current.sorted.map((r) => r.id)).toEqual([3, 1, 2]);
    act(() => result.current.toggle('name'));
    expect(result.current.sort).toBeNull();
    expect(result.current.sorted).toBe(rows);
  });

  it('keeps empty values last in both directions', () => {
    const { result } = renderHook(() => useTableSort(rows));
    act(() => result.current.toggle('price'));
    expect(result.current.sorted.map((r) => r.id)).toEqual([3, 1, 2]);
    act(() => result.current.toggle('price'));
    expect(result.current.sorted.map((r) => r.id)).toEqual([1, 3, 2]);
  });

  it('reads nested values through an accessor', () => {
    const nested = [{ id: 1, owner: { name: 'Zed' } }, { id: 2, owner: { name: 'Amy' } }];
    const { result } = renderHook(() => useTableSort(nested, { accessors: { owner: (r) => r.owner.name } }));
    act(() => result.current.toggle('owner'));
    expect(result.current.sorted.map((r) => r.id)).toEqual([2, 1]);
  });
});

describe('useRowSelection', () => {
  it('reports none / some / all for the header checkbox', () => {
    const { result } = renderHook(() => useRowSelection(['a', 'b']));
    expect(result.current.allState).toBe('none');
    act(() => result.current.toggle('a'));
    expect(result.current.allState).toBe('some');
    expect(result.current.headerCheckbox.indeterminate).toBe(true);
    act(() => result.current.toggleAll());
    expect(result.current.allState).toBe('all');
    act(() => result.current.toggleAll());
    expect(result.current.count).toBe(0);
  });

  it('drops selected rows that are no longer visible', () => {
    const { result, rerender } = renderHook(({ ids }) => useRowSelection(ids), { initialProps: { ids: ['a', 'b', 'c'] } });
    act(() => result.current.toggleAll());
    rerender({ ids: ['a'] });
    expect([...result.current.selected]).toEqual(['a']);
    expect(result.current.allState).toBe('all');
  });
});

describe('pageRange', () => {
  it('lists every page when there are few', () => {
    expect(pageRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('elides around the current page and never exceeds seven slots', () => {
    expect(pageRange(1, 20)).toEqual([1, 2, 3, 4, 5, null, 20]);
    expect(pageRange(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
    expect(pageRange(20, 20)).toEqual([1, null, 16, 17, 18, 19, 20]);
    for (let p = 1; p <= 20; p += 1) expect(pageRange(p, 20).length).toBeLessThanOrEqual(7);
  });
});

describe('sortable <Th>', () => {
  it('announces its order and sorts on click', () => {
    const calls = [];
    const { rerender } = render(
      <Table><Thead><tr><Th sortKey='name' sort={null} onSort={(k) => calls.push(k)}>Name</Th></tr></Thead><Tbody><Tr><td /></Tr></Tbody></Table>
    );
    const header = screen.getByRole('columnheader', { name: /name/i });
    expect(header).toHaveAttribute('aria-sort', 'none');
    fireEvent.click(screen.getByRole('button', { name: /name/i }));
    expect(calls).toEqual(['name']);

    rerender(
      <Table><Thead><tr><Th sortKey='name' sort={{ key: 'name', dir: 'desc' }} onSort={() => {}}>Name</Th></tr></Thead><Tbody><Tr><td /></Tr></Tbody></Table>
    );
    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute('aria-sort', 'descending');
  });

  it('is a plain header without sort props', () => {
    render(<Table><Thead><tr><Th>Plain</Th></tr></Thead><Tbody><Tr><td /></Tr></Tbody></Table>);
    expect(screen.getByRole('columnheader', { name: 'Plain' })).not.toHaveAttribute('aria-sort');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
