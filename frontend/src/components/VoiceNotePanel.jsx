import { useState } from 'react';
import { HiOutlinePlay, HiOutlinePause, HiOutlineTrash, HiOutlineMicrophone } from 'react-icons/hi';
import { apiClient } from '../utils/http';
import VoiceNoteRecorder from './VoiceNoteRecorder';

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function VoiceNoteItem({ note, onDelete, deleting }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useState(() => new Audio(note.url))[0];

  const toggle = () => {
    if (playing) {
      audioRef.pause();
      setPlaying(false);
    } else {
      audioRef.play();
      setPlaying(true);
      audioRef.onended = () => setPlaying(false);
    }
  };

  return (
    <div className='flex items-center gap-3 px-3 py-2.5 bg-white border border-slate-200 rounded-lg group'>
      <button
        type='button'
        onClick={toggle}
        className='w-8 h-8 flex items-center justify-center rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 flex-shrink-0 transition-colors'
      >
        {playing
          ? <HiOutlinePause className='w-4 h-4' />
          : <HiOutlinePlay className='w-4 h-4' />
        }
      </button>

      <div className='flex-1 min-w-0'>
        <p className='text-sm font-medium text-slate-700 truncate'>
          {note.label || 'Voice note'}
        </p>
        <p className='text-xs text-slate-400'>{formatDate(note.createdAt)} · {formatDuration(note.duration)}</p>
      </div>

      <button
        type='button'
        onClick={() => onDelete(note._id)}
        disabled={deleting === note._id}
        className='p-1.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50'
        title='Delete'
      >
        <HiOutlineTrash className='w-4 h-4' />
      </button>
    </div>
  );
}

export default function VoiceNotePanel({ listingId, initialNotes = [] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');

  const handleSave = async (url, duration) => {
    setError('');
    try {
      const res = await apiClient.post(`/listing/${listingId}/voice-notes`, { url, duration });
      setNotes((prev) => [...prev, res.data]);
    } catch {
      setError('Failed to save voice note.');
    }
  };

  const handleDelete = async (noteId) => {
    setDeleting(noteId);
    try {
      await apiClient.delete(`/listing/${listingId}/voice-notes/${noteId}`);
      setNotes((prev) => prev.filter((n) => n._id !== noteId));
    } catch {
      setError('Failed to delete voice note.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-2'>
        <HiOutlineMicrophone className='w-4 h-4 text-slate-500' />
        <h3 className='text-sm font-semibold text-slate-700'>Voice Notes</h3>
        {notes.length > 0 && (
          <span className='text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full'>{notes.length}</span>
        )}
      </div>

      {notes.length > 0 && (
        <div className='space-y-2'>
          {notes.map((note) => (
            <VoiceNoteItem key={note._id} note={note} onDelete={handleDelete} deleting={deleting} />
          ))}
        </div>
      )}

      {notes.length === 0 && (
        <p className='text-xs text-slate-400 py-2'>No voice notes yet.</p>
      )}

      <VoiceNoteRecorder onSave={handleSave} />

      {error && <p className='text-xs text-rose-600'>{error}</p>}
    </div>
  );
}
