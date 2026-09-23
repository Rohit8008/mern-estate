/**
 * The one listing form, in both of its modes.
 *
 * `ListingForm` with mode="create"|"edit" is the ONLY listing form — CreateListing
 * and UpdateListing are 8-line wrappers around it — so this hook is the single
 * point where every property in the product is written. It had no test, and the
 * frontend suite passed anyway because `vitest --passWithNoTests` reports success
 * over an empty directory.
 *
 * The rules worth pinning, all of them documented in CLAUDE.md:
 *   • create POSTs to /listing/create, edit POSTs to /listing/update/:id
 *   • only the fields the form owns are sent, never the whole read payload
 *   • a category field that aliases a native column writes to that column, not
 *     into `attributes` — filters, sorting and duplicate detection read the
 *     column, so a value hidden in the map is invisible to all three
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useListingForm, EMPTY_LISTING } from '../useListingForm';

import { apiClient } from '@/utils/http';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn(), showWarning: vi.fn() }),
}));

// vi.mock is hoisted above the imports, so `apiClient` above is already the mock.
vi.mock('@/utils/http', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  apiClient.get.mockResolvedValue({ data: [] });
  apiClient.post.mockResolvedValue({ data: { _id: 'new-listing-id' } });
});

const submitEvent = () => ({ preventDefault: vi.fn() });

describe('create mode', () => {
  it('starts from the empty listing', () => {
    const { result } = renderHook(() => useListingForm({ mode: 'create' }));

    expect(result.current.isEdit).toBe(false);
    expect(result.current.form.name).toBe(EMPTY_LISTING.name);
    expect(result.current.loading).toBe(false);
  });

  it('does not fetch a listing', () => {
    renderHook(() => useListingForm({ mode: 'create' }));

    const fetched = apiClient.get.mock.calls.map(([url]) => url);
    expect(fetched.some((u) => u.startsWith('/listing/get'))).toBe(false);
  });

  it('POSTs to /listing/create', async () => {
    const { result } = renderHook(() => useListingForm({ mode: 'create' }));

    act(() => result.current.setField('name', 'Plot 42'));
    await act(async () => { await result.current.submit(submitEvent()); });

    expect(apiClient.post).toHaveBeenCalledWith('/listing/create', expect.objectContaining({ name: 'Plot 42' }));
  });

  it('sends only the fields the form owns', async () => {
    // A read returns tenantId, isDeleted, voiceNotes and more. Echoing all of
    // it back would rely on the server's allowlist to discard the rest, and any
    // field added to a read later would silently start being written back.
    const { result } = renderHook(() => useListingForm({ mode: 'create' }));

    act(() => {
      result.current.setField('name', 'Plot 42');
      result.current.setForm((f) => ({ ...f, tenantId: 'leaked', isDeleted: true }));
    });
    await act(async () => { await result.current.submit(submitEvent()); });

    const [, payload] = apiClient.post.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(Object.keys(EMPTY_LISTING).sort());
    expect(payload).not.toHaveProperty('tenantId');
    expect(payload).not.toHaveProperty('isDeleted');
  });

  it('refuses to submit without a name, and does not call the API', async () => {
    const { result } = renderHook(() => useListingForm({ mode: 'create' }));

    await act(async () => { await result.current.submit(submitEvent()); });

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });

  it('surfaces the server message as-is, so a 402 keeps its wording', async () => {
    // A plan limit already says what to do; flattening it to "could not save"
    // would throw that away.
    apiClient.post.mockRejectedValueOnce({ message: 'Your starter plan includes 25 properties.' });
    const { result } = renderHook(() => useListingForm({ mode: 'create' }));

    act(() => result.current.setField('name', 'Plot 42'));
    await act(async () => { await result.current.submit(submitEvent()); });

    expect(result.current.error).toBe('Your starter plan includes 25 properties.');
    expect(result.current.saving).toBe(false);
  });
});

describe('edit mode', () => {
  const existing = {
    _id: 'l1',
    name: 'Plot 7',
    city: 'Bathinda',
    attributes: { facing: 'West' },
    owners: [{ _id: 'o1' }, { _id: 'o2' }],
    imageUrls: ['/uploads/a.jpg'],
  };

  beforeEach(() => {
    apiClient.get.mockImplementation((url) =>
      url.startsWith('/listing/get') ? Promise.resolve({ data: existing }) : Promise.resolve({ data: [] })
    );
  });

  it('hydrates from the fetched listing', async () => {
    const { result } = renderHook(() => useListingForm({ mode: 'edit', listingId: 'l1' }));

    expect(result.current.isEdit).toBe(true);
    await waitFor(() => expect(result.current.form.name).toBe('Plot 7'));
    expect(result.current.form.city).toBe('Bathinda');
    expect(result.current.loading).toBe(false);
  });

  it('normalises populated owners down to ids', async () => {
    const { result } = renderHook(() => useListingForm({ mode: 'edit', listingId: 'l1' }));

    await waitFor(() => expect(result.current.form.ownerIds).toEqual(['o1', 'o2']));
  });

  it('gives a null location a shape the map picker can read', async () => {
    apiClient.get.mockImplementation((url) =>
      url.startsWith('/listing/get')
        ? Promise.resolve({ data: { ...existing, location: null } })
        : Promise.resolve({ data: [] })
    );
    const { result } = renderHook(() => useListingForm({ mode: 'edit', listingId: 'l1' }));

    await waitFor(() => expect(result.current.form.location).toEqual({ lat: null, lng: null }));
  });

  it('POSTs to /listing/update/:id, not /listing/create', async () => {
    const { result } = renderHook(() => useListingForm({ mode: 'edit', listingId: 'l1' }));
    await waitFor(() => expect(result.current.form.name).toBe('Plot 7'));

    await act(async () => { await result.current.submit(submitEvent()); });

    expect(apiClient.post).toHaveBeenCalledWith('/listing/update/l1', expect.objectContaining({ name: 'Plot 7' }));
  });

  it('reports a load failure instead of showing an empty form as if it were the listing', async () => {
    apiClient.get.mockImplementation((url) =>
      url.startsWith('/listing/get')
        ? Promise.reject({ message: 'That property could not be loaded.' })
        : Promise.resolve({ data: [] })
    );
    const { result } = renderHook(() => useListingForm({ mode: 'edit', listingId: 'l1' }));

    await waitFor(() => expect(result.current.loadError).toBe('That property could not be loaded.'));
  });
});

describe('category fields that alias a native column', () => {
  it('writes an aliased key to the column, not into attributes', async () => {
    const { result } = renderHook(() => useListingForm({ mode: 'create' }));

    act(() => result.current.setCategoryField('rateSqYard', 4500));

    // rateSqYard -> sqYardRate. Filters and duplicate detection read the column.
    expect(result.current.form.sqYardRate).toBe(4500);
    expect(result.current.form.attributes.rateSqYard).toBeUndefined();
  });

  it('writes an unaliased key into attributes', async () => {
    const { result } = renderHook(() => useListingForm({ mode: 'create' }));

    act(() => result.current.setCategoryField('facing', 'West'));

    expect(result.current.form.attributes.facing).toBe('West');
    expect(result.current.form.facing).toBeUndefined();
  });

  it('reads a value back from wherever it lives', async () => {
    const { result } = renderHook(() => useListingForm({ mode: 'create' }));

    act(() => {
      result.current.setCategoryField('rateSqYard', 4500);
      result.current.setCategoryField('facing', 'West');
    });

    expect(result.current.categoryFieldValue('rateSqYard')).toBe(4500);
    expect(result.current.categoryFieldValue('facing')).toBe('West');
  });
});

describe('patch', () => {
  it('fills gaps without overwriting what the user already typed', () => {
    // Geocoding calls this. Blanking a field someone filled in by hand would be
    // the worst possible behaviour for an address lookup.
    const { result } = renderHook(() => useListingForm({ mode: 'create' }));

    act(() => result.current.setField('city', 'Bathinda'));
    act(() => result.current.patch({ city: '', state: 'Punjab', locality: null }));

    expect(result.current.form.city).toBe('Bathinda');
    expect(result.current.form.state).toBe('Punjab');
  });
});
