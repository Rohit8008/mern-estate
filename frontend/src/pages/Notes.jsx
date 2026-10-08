import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HiOutlinePencilAlt, HiOutlineTrash, HiOutlineHome, HiOutlineCheckCircle } from 'react-icons/hi';
import { apiClient } from '@/utils/http';
import { Button, Card, EmptyState, Spinner, Textarea } from '@/design-system';
import VoiceNoteRecorder from '../components/VoiceNoteRecorder';
import { useNotification } from '../contexts/NotificationContext';
import ConfirmDialog from '../components/ConfirmDialog';

function when(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Notes() {
  const navigate = useNavigate();
  const { showError, showSuccess } = useNotification();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await apiClient.get('/notes', { silent: true });
      setNotes(Array.isArray(data) ? data : []);
    } catch (err) {
      showError(err?.message || 'Could not load your notes.');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const saveText = async () => {
    const body = text.trim();
    if (!body) return;
    setSaving(true);
    try {
      const note = await apiClient.post('/notes', { text: body });
      setNotes((prev) => [note, ...prev]);
      setText('');
    } catch (err) {
      showError(err?.message || 'Could not save the note.');
    } finally {
      setSaving(false);
    }
  };

  const saveVoice = async (url, duration) => {
    try {
      const note = await apiClient.post('/notes', { audioUrl: url, audioDuration: duration });
      setNotes((prev) => [note, ...prev]);
      showSuccess('Voice note saved.');
    } catch (err) {
      showError(err?.message || 'Could not save the voice note.');
    }
  };

  const remove = async (id) => {
    setNotes((prev) => prev.filter((n) => n._id !== id));
    try {
      await apiClient.delete(`/notes/${id}`);
    } catch (err) {
      showError(err?.message || 'Could not delete the note.');
      load();
    }
  };

  return (
    <main className='min-h-screen bg-slate-50'>
      <div className='max-w-3xl mx-auto px-4 py-6 md:py-8'>
        <header className='mb-6'>
          <h1 className='text-2xl font-bold text-slate-900 flex items-center gap-2'>
            <HiOutlinePencilAlt className='w-6 h-6 text-brand-600' /> Notes
          </h1>
          <p className='text-sm text-slate-500 mt-1'>
            Quick captures — jot a note or record a voice memo now, act on it later (e.g. turn it into a property).
          </p>
        </header>

        {/* Composer */}
        <Card className='mb-6'>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Type a note… e.g. '2BHK in Sector 21, owner Raj 98xxxxxx, wants ₹45L, call after 6pm'"
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveText(); }}
          />
          <div className='flex items-center justify-between gap-3 mt-3'>
            <VoiceNoteRecorder onSave={saveVoice} disabled={saving} />
            <Button variant='primary' onClick={saveText} loading={saving} disabled={!text.trim()}>
              Save note
            </Button>
          </div>
        </Card>

        {/* List */}
        {loading ? (
          <div className='flex justify-center py-16'><Spinner /></div>
        ) : notes.length === 0 ? (
          <EmptyState
            icon={HiOutlinePencilAlt}
            title='No notes yet'
            body='Capture a quick thought or a voice memo above — it stays private to you.'
          />
        ) : (
          <ul className='space-y-3'>
            {notes.map((n) => (
              <li key={n._id}>
                <Card>
                  {n.text && <p className='text-sm text-slate-800 whitespace-pre-wrap break-words'>{n.text}</p>}
                  {n.audioUrl && (
                    <audio controls src={n.audioUrl} className='mt-2 w-full h-10'>
                      Your browser does not support audio playback.
                    </audio>
                  )}
                  <div className='flex items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-100'>
                    <span className='text-xs text-slate-400'>{when(n.createdAt)}</span>
                    <div className='flex items-center gap-1'>
                      {n.createdListing ? (
                        <Link
                          to={`/listing/${n.createdListing._id}`}
                          className='inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg hover:bg-emerald-100'
                        >
                          <HiOutlineCheckCircle className='w-4 h-4' /> Property created
                        </Link>
                      ) : (
                        <button
                          type='button'
                          onClick={() => navigate('/create-listing')}
                          className='inline-flex items-center gap-1 text-xs font-medium text-brand-700 bg-brand-50 px-2.5 py-1 rounded-lg hover:bg-brand-100 transition-colors'
                        >
                          <HiOutlineHome className='w-4 h-4' /> Create property
                        </button>
                      )}
                      <button
                        type='button'
                        aria-label='Delete note'
                        onClick={() => setPendingDelete(n)}
                        className='p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors'
                      >
                        <HiOutlineTrash className='w-4 h-4' />
                      </button>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <ConfirmDialog
          open={!!pendingDelete}
          title='Delete this note?'
          description='This cannot be undone.'
          confirmLabel='Delete'
          onConfirm={() => { if (pendingDelete) remove(pendingDelete._id); setPendingDelete(null); }}
          onCancel={() => setPendingDelete(null)}
        />
      </div>
    </main>
  );
}
