/**
 * The legal pages render, and say what the code does.
 *
 * The first Privacy Policy said "one essential cookie" while the backend set
 * three. These assertions tie the page to the facts most likely to drift: the
 * cookie names the backend sets (auth.controller.js, middleware/csrf.js) and
 * the self-service export that the policy tells people to use.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../i18n';
import { Privacy, Terms, Cookies, Refunds } from '../Legal';
import Footer from '../../components/Footer';

const renderAt = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('legal pages', () => {
  it.each([
    ['Privacy', Privacy],
    ['Terms', Terms],
    ['Cookies', Cookies],
    ['Refunds', Refunds],
  ])('%s renders one h1, business details and a grievance contact', (_name, Page) => {
    renderAt(<Page />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Business details' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Contact and grievances' })).toBeInTheDocument();
  });

  it('lists every cookie the backend sets', () => {
    renderAt(<Cookies />);
    for (const name of ['access_token', 'refresh_token', 'csrf_token']) {
      expect(screen.getByRole('rowheader', { name })).toBeInTheDocument();
    }
  });

  it('points people at the export that exists', () => {
    renderAt(<Privacy />);
    expect(screen.getByText(/Download my data/)).toBeInTheDocument();
  });

  it('footer links to all four policies and has no newsletter field', () => {
    renderAt(<Footer />);
    for (const path of ['/privacy', '/terms', '/cookies', '/refunds']) {
      expect(document.querySelector(`a[href="${path}"]`)).not.toBeNull();
    }
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
