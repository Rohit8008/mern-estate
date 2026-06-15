import { useState, useRef, useEffect } from 'react';
import { uploadToCloudinary } from '../utils/cloudinary';
import { HiOutlineMicrophone, HiOutlineStop, HiOutlineUpload, HiX } from 'react-icons/hi';

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function VoiceNoteRecorder({ onSave, disabled }) {
  const [state, setState] = useState('idle'); // idle | recording | uploading
  const [elapsed, setElapsed] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    mediaRecorderRef.current?.state === 'recording' && mediaRecorderRef.current.stop();
  }, []);

  const startRecording = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => stream.getTracks().forEach((t) => t.stop());

      mr.start();
      setState('recording');
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      setError('Microphone access denied.');
    }
  };

  const stopAndSave = () => {
    if (!mediaRecorderRef.current) return;
    clearInterval(timerRef.current);

    const duration = elapsed;
    mediaRecorderRef.current.onstop = async () => {
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      setState('uploading');
      setUploadProgress(0);

      try {
        const url = await uploadToCloudinary(blob, {
          folder: 'voice-notes',
          filename: `voice-note-${Date.now()}`,
          onProgress: setUploadProgress,
        });
        onSave(url, duration);
        setState('idle');
        setElapsed(0);
      } catch {
        setError('Upload failed. Try again.');
        setState('idle');
      }
    };

    mediaRecorderRef.current.stop();
  };

  const cancel = () => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.onstop = () => mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current.stop();
    }
    setState('idle');
    setElapsed(0);
    setError('');
  };

  if (state === 'idle') {
    return (
      <div>
        <button
          type='button'
          onClick={startRecording}
          disabled={disabled}
          className='flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
        >
          <HiOutlineMicrophone className='w-4 h-4 text-rose-500' />
          Record voice note
        </button>
        {error && <p className='mt-1.5 text-xs text-rose-600'>{error}</p>}
      </div>
    );
  }

  if (state === 'recording') {
    return (
      <div className='flex items-center gap-3 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg'>
        <span className='w-2 h-2 rounded-full bg-rose-500 animate-pulse flex-shrink-0' />
        <span className='text-sm font-mono font-medium text-rose-700 w-12'>{formatDuration(elapsed)}</span>
        <button
          type='button'
          onClick={stopAndSave}
          className='flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md transition-colors'
        >
          <HiOutlineStop className='w-3.5 h-3.5' />
          Stop & save
        </button>
        <button type='button' onClick={cancel} className='p-1 text-slate-400 hover:text-slate-600'>
          <HiX className='w-4 h-4' />
        </button>
      </div>
    );
  }

  // uploading
  return (
    <div className='flex items-center gap-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg'>
      <HiOutlineUpload className='w-4 h-4 text-indigo-500 flex-shrink-0' />
      <div className='flex-1'>
        <div className='flex justify-between text-xs text-slate-500 mb-1'>
          <span>Uploading…</span>
          <span>{uploadProgress}%</span>
        </div>
        <div className='w-full bg-slate-200 rounded-full h-1.5'>
          <div className='bg-indigo-500 h-1.5 rounded-full transition-all' style={{ width: `${uploadProgress}%` }} />
        </div>
      </div>
    </div>
  );
}
