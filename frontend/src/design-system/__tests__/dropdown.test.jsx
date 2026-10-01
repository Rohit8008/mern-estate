/**
 * The menu-button keyboard contract. Every account menu, row-action menu and
 * column picker inherits it, so a regression here is a regression everywhere.
 */

import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Dropdown, { DropdownItem, DropdownSeparator } from '../Dropdown';
import Tabs, { TabPanel } from '../Tabs';

function Menu({ onEdit = () => {}, onDelete = () => {} }) {
  return (
    <Dropdown label='Actions' trigger={(props) => <button {...props}>Actions</button>}>
      <DropdownItem onSelect={onEdit}>Edit</DropdownItem>
      <DropdownItem disabled>Archive</DropdownItem>
      <DropdownSeparator />
      <DropdownItem danger onSelect={onDelete}>Delete</DropdownItem>
    </Dropdown>
  );
}

/** A key press on whatever has focus, the way a real keyboard delivers it. */
const key = (k) => fireEvent.keyDown(document.activeElement, { key: k });

describe('Dropdown', () => {
  it('opens on click, focuses the first item and announces itself', () => {
    render(<Menu />);
    const trigger = screen.getByRole('button', { name: 'Actions' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
  });

  it('moves with arrows, skips disabled items and wraps', () => {
    render(<Menu />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    key('ArrowDown');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    key('ArrowDown');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    key('End');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
  });

  it('jumps to an item by its first letter', () => {
    render(<Menu />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    key('d');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
  });

  it('closes on Escape and hands focus back to the trigger', () => {
    render(<Menu />);
    const trigger = screen.getByRole('button', { name: 'Actions' });
    fireEvent.click(trigger);
    key('Escape');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('runs the action and closes on select, and ignores disabled items', () => {
    const onDelete = vi.fn();
    render(<Menu onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on a click outside', () => {
    render(<><Menu /><p>Elsewhere</p></>);
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    fireEvent.mouseDown(screen.getByText('Elsewhere'));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('Tabs', () => {
  function Harness() {
    const items = [{ value: 'a', label: 'Overview' }, { value: 'b', label: 'Documents', count: 3 }];
    const [value, setValue] = useState('a');
    return (
      <>
        <Tabs id='t' items={items} value={value} onChange={setValue} />
        <TabPanel tabsId='t' value='a' active={value}>Overview body</TabPanel>
        <TabPanel tabsId='t' value='b' active={value}>Documents body</TabPanel>
      </>
    );
  }

  it('uses a roving tabindex and moves with arrows', () => {
    render(<Harness />);
    const overview = screen.getByRole('tab', { name: 'Overview' });
    const docs = screen.getByRole('tab', { name: /Documents/ });
    expect(overview).toHaveAttribute('tabindex', '0');
    expect(docs).toHaveAttribute('tabindex', '-1');

    overview.focus();
    key('ArrowRight');
    expect(docs).toHaveFocus();
    expect(docs).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Documents body');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', docs.id);
  });
});
