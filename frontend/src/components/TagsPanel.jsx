import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineTag, HiOutlineTrash, HiOutlinePencil, HiCheck, HiX } from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';
import { Button, EmptyState, Input, SkeletonRows, Table, Tbody, Td, Th, Thead, Tr } from '../design-system';
import ConfirmDialog from './ConfirmDialog';
import { TagChip, tagClasses } from './TagPicker';

/**
 * The workspace's tag taxonomy: rename, recolour, delete.
 *
 * Tags could be created inline from any record but never managed, so a typo
 * lived forever and an unwanted colour could not be changed. Renaming here
 * renames the tag on every record, because records hold the id, not the text.
 *
 * Deleting detaches the tag from every record first (tag.controller.js), so
 * the confirmation says how many records carry it — that count is the cost.
 */
export default function TagsPanel() {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotification();
  const [tags, setTags] = useState([]);
  const [colors, setColors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { id, name, color }
  const [newName, setNewName] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await apiClient.get('/tags');
      setTags(res?.data?.tags || []);
      setColors(res?.data?.colors || []);
    } catch (err) {
      showError(err?.message || t('tagsPanel.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await apiClient.post('/tags', { name });
      setNewName('');
      await load();
    } catch (err) {
      showError(err?.message || t('tagsPanel.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editing?.name.trim()) return;
    setBusy(true);
    try {
      await apiClient.patch(`/tags/${editing.id}`, { name: editing.name.trim(), color: editing.color });
      setEditing(null);
      showSuccess(t('tagsPanel.saved'));
      await load();
    } catch (err) {
      // 409: another tag already has that name.
      showError(err?.message || t('tagsPanel.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const tag = confirm;
    setConfirm(null);
    try {
      await apiClient.delete(`/tags/${tag._id}`);
      setTags((list) => list.filter((x) => x._id !== tag._id));
      showSuccess(t('tagsPanel.deleted', { name: tag.name }));
    } catch (err) {
      showError(err?.message || t('tagsPanel.deleteFailed'));
    }
  };

  return (
    <div className='space-y-5'>
      <div>
        <h2 className='text-base font-semibold text-foreground'>{t('tagsPanel.title')}</h2>
        <p className='text-sm text-muted-foreground mt-0.5'>{t('tagsPanel.description')}</p>
      </div>

      <form onSubmit={create} className='flex items-end gap-2 max-w-md'>
        <div className='flex-1'>
          <Input
            label={t('tagsPanel.newTag')}
            value={newName}
            maxLength={40}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('tagsPanel.newTagPlaceholder')}
          />
        </div>
        <Button type='submit' variant='primary' loading={busy && !editing} disabled={!newName.trim()}>
          {t('common.add')}
        </Button>
      </form>

      {!loading && tags.length === 0 ? (
        <EmptyState icon={HiOutlineTag} title={t('tagsPanel.emptyTitle')} body={t('tagsPanel.emptyBody')} />
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>{t('tagsPanel.tag')}</Th>
              <Th>{t('tagsPanel.colour')}</Th>
              <Th right>{t('tagsPanel.usedOn')}</Th>
              <Th right><span className='sr-only'>{t('tagsPanel.actions')}</span></Th>
            </tr>
          </Thead>
          <Tbody>
            {loading ? <SkeletonRows rows={4} columns={4} /> : tags.map((tag) => {
              const isEditing = editing?.id === tag._id;
              return (
                <Tr key={tag._id}>
                  <Td>
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editing.name}
                        maxLength={40}
                        aria-label={t('tagsPanel.tagName')}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); save(); }
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        className='w-48 px-2 py-1 text-sm rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500'
                      />
                    ) : (
                      <TagChip tag={tag} />
                    )}
                  </Td>
                  <Td>
                    {isEditing ? (
                      <div className='flex flex-wrap gap-1.5' role='radiogroup' aria-label={t('tagsPanel.colour')}>
                        {colors.map((c) => (
                          <button
                            key={c}
                            type='button'
                            role='radio'
                            aria-checked={editing.color === c}
                            aria-label={c}
                            onClick={() => setEditing({ ...editing, color: c })}
                            className={`w-6 h-6 rounded-md ring-1 ${tagClasses(c)} ${editing.color === c ? 'outline outline-2 outline-offset-1 outline-brand-600' : ''}`}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className='capitalize text-muted-foreground'>{tag.color}</span>
                    )}
                  </Td>
                  <Td right muted className='tabular-nums'>{t('tagsPanel.records', { count: tag.usageCount || 0 })}</Td>
                  <Td right>
                    <div className='flex items-center justify-end gap-1'>
                      {isEditing ? (
                        <>
                          <Button size='xs' variant='primary' icon={HiCheck} onClick={save} loading={busy}>{t('common.save')}</Button>
                          <Button size='xs' variant='ghost' icon={HiX} onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
                        </>
                      ) : (
                        <>
                          <Button size='xs' variant='ghost' icon={HiOutlinePencil} onClick={() => setEditing({ id: tag._id, name: tag.name, color: tag.color })} aria-label={t('tagsPanel.editTag', { name: tag.name })}>
                            {t('common.edit')}
                          </Button>
                          <Button size='xs' variant='ghost' icon={HiOutlineTrash} onClick={() => setConfirm(tag)} aria-label={t('tagsPanel.deleteTag', { name: tag.name })} className='text-rose-600 hover:text-rose-700'>
                            {t('common.delete')}
                          </Button>
                        </>
                      )}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={t('tagsPanel.deleteTitle', { name: confirm?.name || '' })}
        description={t('tagsPanel.deleteBody', { count: confirm?.usageCount || 0 })}
        confirmLabel={t('common.delete')}
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
