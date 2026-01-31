import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function PasswordReset() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [emailLocked, setEmailLocked] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef([]);
  const restoredRef = useRef(false);
  const redirectTimerRef = useRef(null);

  useEffect(() => {
    const combined = otpDigits.join('');
    if (combined !== otp) setOtp(combined);
  }, [otpDigits]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  // Restore state on refresh
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('pwreset_state');
      if (raw) {
        const s = JSON.parse(raw);
        if (s && typeof s === 'object') {
          if (s.step) setStep(s.step);
          if (s.email) setEmail(s.email);
          if (typeof s.emailLocked === 'boolean') setEmailLocked(s.emailLocked);
          if (Array.isArray(s.otpDigits) && s.otpDigits.length === 6) setOtpDigits(s.otpDigits);
          if (typeof s.secondsLeft === 'number') setSecondsLeft(s.secondsLeft);
          restoredRef.current = true;
          if (s.step >= 3) {
            try { sessionStorage.removeItem('pwreset_state'); } catch (_) {}
            navigate('/');
            return;
          }
        }
      }
    } catch (_) {}
  }, [navigate]);

  // Persist state
  useEffect(() => {
    try {
      sessionStorage.setItem('pwreset_state', JSON.stringify({ step, email, emailLocked, secondsLeft, otpDigits }));
    } catch (_) {}
  }, [step, email, emailLocked, secondsLeft, otpDigits]);

  useEffect(() => {
    // Prefill email from query; auto-request OTP if auto=1
    const params = new URLSearchParams(location.search);
    const e = params.get('email');
    const auto = params.get('auto') === '1';
    if (e) { setEmail(e); setEmailLocked(true); }
    // If we already restored step >= 2, don't auto-send
    try {
      const saved = JSON.parse(sessionStorage.getItem('pwreset_state') || 'null');
      if (saved && saved.step >= 2) return;
    } catch (_) {}
    if (e && auto) {
      const key = `otpAuto:${e}`;
      if (sessionStorage.getItem(key) === '1') return;
      (async () => {
        try {
          setLoading(true);
          const res = await fetch('/api/user/password/request-otp', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.message || 'Failed');
          setMessage(`OTP sent to ${data.to || 'your email'}` + (data.devOtp ? ` (dev: ${data.devOtp})` : ''));
          setStep(2);
          setEmailLocked(true);
          try { sessionStorage.setItem(key, '1'); } catch (_) {}
          setSecondsLeft(60);
        } catch (err) {
          setError(err.message || 'Failed to send OTP');
        } finally { setLoading(false); }
      })();
    }
  }, []);

  // On done step, redirect home after 5s
  useEffect(() => {
    if (step >= 3) {
      try { sessionStorage.removeItem('pwreset_state'); } catch (_) {}
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = setTimeout(() => {
        navigate('/');
      }, 5000);
      return () => {
        if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      };
    }
  }, [step, navigate]);

  const requestOtp = async () => {
    try {
      setLoading(true); setError(''); setMessage('');
      const res = await fetch('/api/user/password/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) throw new Error(data?.message || 'Failed');
      setMessage(`OTP sent to ${data.to || 'your email'}` + (data.devOtp ? ` (dev: ${data.devOtp})` : ''));
      setStep(2);
      setEmailLocked(true);
      setSecondsLeft(60);
    } catch (e) {
      setError(e.message || 'Failed to send OTP');
    } finally { setLoading(false); }
  };

  const resetPassword = async () => {
    try {
      setLoading(true); setError(''); setMessage('');
      const res = await fetch('/api/user/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) throw new Error(data?.message || 'Failed');
      setMessage('Password updated. You can sign in with your new password.');
      setStep(3);
    } catch (e) {
      setError(e.message || 'Failed to reset password');
    } finally { setLoading(false); }
  };

  return (
    <main className='max-w-md mx-auto p-6'>
      <div className='bg-white rounded-xl shadow p-5'>
        <div className='flex items-center gap-2 text-xs text-slate-600 mb-3'>
          <span className={`px-2 py-1 rounded ${step>=1?'bg-slate-900 text-white':'bg-slate-100'}`}>1</span>
          <span>Identify</span>
          <span className='mx-1'>→</span>
          <span className={`px-2 py-1 rounded ${step>=2?'bg-slate-900 text-white':'bg-slate-100'}`}>2</span>
          <span>Verify</span>
          <span className='mx-1'>→</span>
          <span className={`px-2 py-1 rounded ${step>=3?'bg-slate-900 text-white':'bg-slate-100'}`}>3</span>
          <span>Done</span>
        </div>
        <h1 className='text-2xl font-semibold mb-2'>Password Reset</h1>
        <p className='text-sm text-slate-600 mb-4'>Use the email on file to receive a one-time code, then set a new password.</p>
      {step === 1 && (
        <div className='space-y-3'>
          <label className='block text-sm'>Email</label>
          {emailLocked ? (
            <input className='border p-3 rounded w-full bg-slate-50 text-slate-500 cursor-not-allowed' value={email} disabled />
          ) : (
            <input className='border p-3 rounded w-full' type='email' value={email} onChange={(e) => setEmail(e.target.value)} placeholder='you@example.com' />
          )}
          <button disabled={loading || !email} onClick={requestOtp} className='bg-slate-800 text-white rounded px-4 py-2 disabled:opacity-60'>
            {loading ? 'Sending…' : 'Send OTP'}
          </button>
        </div>
      )}
      {step === 2 && (
        <div className='space-y-4'>
          <div className='text-sm text-slate-600'>We sent a 6-digit OTP to your email {emailLocked ? `(${email})` : ''}.</div>
          <div>
            <label className='block text-sm mb-2'>OTP</label>
            <div className='flex gap-2 justify-between'>
              {otpDigits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (otpRefs.current[i] = el)}
                  className='border rounded w-10 h-12 text-center text-lg'
                  maxLength={1}
                  value={d}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0,1);
                    setOtpDigits((prev) => prev.map((x, idx) => (idx === i ? val : x)));
                    if (val && i < 5) otpRefs.current[i+1]?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !otpDigits[i] && i > 0) otpRefs.current[i-1]?.focus();
                  }}
                  onPaste={(e) => {
                    const clip = e.clipboardData.getData('text').replace(/\D/g, '').slice(0,6);
                    if (!clip) return;
                    e.preventDefault();
                    const next = clip.padEnd(6, ' ').split('').slice(0,6);
                    setOtpDigits(next);
                    otpRefs.current[5]?.focus();
                  }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className='block text-sm mb-2'>New Password</label>
            <input className='border p-3 rounded w-full' type='password' value={password} onChange={(e) => setPassword(e.target.value)} placeholder='Enter new password' />
          </div>
          <div className='flex items-center justify-between'>
            <button disabled={loading || otp.length !== 6 || !password} onClick={resetPassword} className='bg-slate-800 text-white rounded px-4 py-2 disabled:opacity-60'>
              {loading ? 'Updating…' : 'Update Password'}
            </button>
            <button disabled={secondsLeft>0 || loading} onClick={requestOtp} className='text-sm text-slate-700 underline disabled:opacity-60'>
              {secondsLeft>0 ? `Resend in ${secondsLeft}s` : 'Resend OTP'}
            </button>
          </div>
        </div>
      )}
      {message && <p className='text-green-700 mt-4'>{message}</p>}
      {error && <p className='text-red-700 mt-4'>{error}</p>}
      </div>
    </main>
  );
}


