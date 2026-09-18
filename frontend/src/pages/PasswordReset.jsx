import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineLockClosed, HiOutlineExclamationCircle, HiOutlineCheckCircle } from 'react-icons/hi';
import { apiClient } from '../utils/http';
import { Input, Button } from '../design-system';
import { useTranslation } from 'react-i18next';

export default function PasswordReset() {
  const { t } = useTranslation();
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
            try { sessionStorage.removeItem('pwreset_state'); } catch (_) { }
            navigate('/');
            return;
          }
        }
      }
    } catch (_) { }
  }, [navigate]);

  // Persist state
  useEffect(() => {
    try {
      sessionStorage.setItem('pwreset_state', JSON.stringify({ step, email, emailLocked, secondsLeft, otpDigits }));
    } catch (_) { }
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
    } catch (_) { }
    if (e && auto) {
      const key = `otpAuto:${e}`;
      if (sessionStorage.getItem(key) === '1') return;
      (async () => {
        try {
          setLoading(true);
          const data = await apiClient.post('/user/password/request-otp', { email: e });
          setMessage(`OTP sent to ${data.to || 'your email'}` + (data.devOtp ? ` (dev: ${data.devOtp})` : ''));
          setStep(2);
          setEmailLocked(true);
          try { sessionStorage.setItem(key, '1'); } catch (_) { }
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
      try { sessionStorage.removeItem('pwreset_state'); } catch (_) { }
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
      const data = await apiClient.post('/user/password/request-otp', { email });
      if (data?.success === false) throw new Error(data?.message || 'Failed');
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
      const data = await apiClient.post('/user/password/reset', { email, otp, newPassword: password });
      if (data?.success === false) throw new Error(data?.message || 'Failed');
      setMessage('Password updated. You can sign in with your new password.');
      setStep(3);
    } catch (e) {
      setError(e.message || 'Failed to reset password');
    } finally { setLoading(false); }
  };

  return (
    <div className='min-h-[calc(100vh-3.5rem)] bg-slate-50 flex items-center justify-center p-4'>
      <div className='max-w-md w-full space-y-8'>
        {/* Header */}
        <div className='text-center'>
          <div className='flex justify-center mb-8'>
            <div className='w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20'>
              <HiOutlineLockClosed className='w-8 h-8 text-white' />
            </div>
          </div>
          <h1 className='text-3xl font-bold text-slate-900 mb-2'>{t('passwordReset.passwordReset')}</h1>
          <p className='text-base text-slate-600'>{t('passwordReset.useTheEmailOnFileTo')}</p>
        </div>

        {/* Form */}
        <div className='bg-white rounded-2xl border border-slate-200 shadow-md p-8'>
          <div className='flex items-center justify-center gap-2 mb-6'>
            {[1, 2, 3].map((s) => (
              <div key={s} className={`w-2 h-2 rounded-full ${step >= s ? 'bg-indigo-600' : 'bg-slate-200'}`} />
            ))}
          </div>

          {step === 1 && (
            <div className='space-y-5'>
              <Input
                label={t('passwordReset.email')}
                type='email'
                value={email}
                disabled={emailLocked}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('passwordReset.youExampleCom')}
              />
              <Button
                disabled={loading || !email}
                loading={loading}
                onClick={requestOtp}
                size='lg'
                className='w-full justify-center'
              >{t('passwordReset.sendOtp')}</Button>
            </div>
          )}

          {step === 2 && (
            <div className='space-y-5'>
              <p className='text-sm text-slate-600'>We sent a 6-digit OTP to your email {emailLocked ? <span className='font-medium text-slate-800'>({email})</span> : ''}.</p>
              <div>
                <label className='block text-sm font-medium text-slate-700 mb-2'>{t('passwordReset.otp')}</label>
                <div className='flex gap-2 justify-between'>
                  {otpDigits.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => (otpRefs.current[i] = el)}
                      aria-label={`OTP digit ${i + 1} of 6`}
                      inputMode='numeric'
                      className='border border-slate-300 rounded-lg w-11 h-12 text-center text-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors'
                      maxLength={1}
                      value={d}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 1);
                        setOtpDigits((prev) => prev.map((x, idx) => (idx === i ? val : x)));
                        if (val && i < 5) otpRefs.current[i + 1]?.focus();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !otpDigits[i] && i > 0) otpRefs.current[i - 1]?.focus();
                      }}
                      onPaste={(e) => {
                        const clip = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                        if (!clip) return;
                        e.preventDefault();
                        const next = clip.padEnd(6, ' ').split('').slice(0, 6);
                        setOtpDigits(next);
                        otpRefs.current[5]?.focus();
                      }}
                    />
                  ))}
                </div>
              </div>
              <Input
                label={t('passwordReset.newPassword')}
                type='password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('passwordReset.enterNewPassword')}
              />
              <div className='flex items-center justify-between gap-3'>
                <Button
                  disabled={loading || otp.length !== 6 || !password}
                  loading={loading}
                  onClick={resetPassword}
                >{t('passwordReset.updatePassword')}</Button>
                <button
                  disabled={secondsLeft > 0 || loading}
                  onClick={requestOtp}
                  className='text-sm text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:text-slate-400'
                >
                  {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend OTP'}
                </button>
              </div>
            </div>
          )}

          {message && (
            <div className='mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3'>
              <HiOutlineCheckCircle className='w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0' />
              <p className='text-sm font-medium text-emerald-800'>{message}</p>
            </div>
          )}
          {error && (
            <div className='mt-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3'>
              <HiOutlineExclamationCircle className='w-5 h-5 text-rose-500 mt-0.5 flex-shrink-0' />
              <p className='text-sm font-medium text-rose-800'>{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


