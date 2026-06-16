import { useState, useRef, useEffect, useCallback } from 'react';
import { HiCamera, HiRefresh, HiCheck, HiX, HiSwitchHorizontal } from 'react-icons/hi';
import Modal from '../design-system/Modal';
import Button from '../design-system/Button';

export default function CameraCapture({ open, onClose, onCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [phase, setPhase] = useState('streaming'); // streaming | captured | error
  const [facingMode, setFacingMode] = useState('user');
  const [capturedUrl, setCapturedUrl] = useState(null);
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async (mode) => {
    stopStream();
    setErrorMsg('');
    setPhase('streaming');
    setCapturedUrl(null);
    setCapturedBlob(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setErrorMsg('Camera access denied. Please allow camera permissions in your browser.');
      setPhase('error');
    }
  }, [stopStream]);

  useEffect(() => {
    if (open) {
      startCamera(facingMode);
    } else {
      stopStream();
      setPhase('streaming');
      setCapturedUrl(null);
      setCapturedBlob(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    stopStream();
    onClose();
  };

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      setCapturedBlob(blob);
      setCapturedUrl(URL.createObjectURL(blob));
      stopStream();
      setPhase('captured');
    }, 'image/jpeg', 0.92);
  };

  const handleRetake = () => {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(null);
    setCapturedBlob(null);
    startCamera(facingMode);
  };

  const handleUse = () => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
    onCapture(file);
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    handleClose();
  };

  const handleFlip = () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    startCamera(next);
  };

  return (
    <Modal open={open} onClose={handleClose} title='Take a Photo' size='lg'>
      <div className='flex flex-col items-center gap-4'>

        {/* Error state */}
        {phase === 'error' && (
          <div className='w-full bg-rose-50 border border-rose-200 rounded-xl p-5 text-center'>
            <p className='text-sm text-rose-700'>{errorMsg}</p>
            <Button
              variant='secondary'
              className='mt-3'
              onClick={() => startCamera(facingMode)}
            >
              Try Again
            </Button>
          </div>
        )}

        {/* Live preview */}
        {phase === 'streaming' && (
          <div className='relative w-full rounded-xl overflow-hidden bg-slate-900 aspect-video'>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className='w-full h-full object-cover'
            />
            {/* Flip camera button */}
            <button
              type='button'
              onClick={handleFlip}
              title='Switch camera'
              className='absolute top-3 right-3 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full transition-colors'
            >
              <HiSwitchHorizontal className='w-5 h-5' />
            </button>
          </div>
        )}

        {/* Captured preview */}
        {phase === 'captured' && capturedUrl && (
          <div className='relative w-full rounded-xl overflow-hidden bg-slate-900 aspect-video'>
            <img src={capturedUrl} alt='Captured' className='w-full h-full object-cover' />
          </div>
        )}

        {/* Hidden canvas for frame extraction */}
        <canvas ref={canvasRef} className='hidden' />

        {/* Controls */}
        <div className='flex items-center gap-3 w-full justify-center'>
          {phase === 'streaming' && (
            <>
              <Button variant='secondary' icon={HiX} onClick={handleClose}>
                Cancel
              </Button>
              <Button icon={HiCamera} onClick={handleCapture}>
                Capture
              </Button>
            </>
          )}

          {phase === 'captured' && (
            <>
              <Button variant='secondary' icon={HiRefresh} onClick={handleRetake}>
                Retake
              </Button>
              <Button icon={HiCheck} onClick={handleUse}>
                Use Photo
              </Button>
            </>
          )}

          {phase === 'error' && (
            <Button variant='secondary' icon={HiX} onClick={handleClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
