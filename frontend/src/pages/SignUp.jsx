import { useNavigate } from 'react-router-dom';
import { HiOutlineOfficeBuilding } from 'react-icons/hi';
import { Button } from '../design-system';
import usePageTitle from '../hooks/usePageTitle';
import { useTranslation } from 'react-i18next';

export default function SignUp() {
  const { t } = useTranslation();
  usePageTitle('Create Account');
  const navigate = useNavigate();
  return (
    <div className='min-h-[calc(100vh-3.5rem)] bg-[#f3f5f4] flex items-center justify-center p-4'>
      <div className='bg-white rounded-2xl shadow-lg border border-slate-200 w-full max-w-sm p-8 flex flex-col items-center gap-6 crm-animate-in'>
        {/* Logo */}
        <div className='flex items-center gap-2'>
          <div className='w-9 h-9 bg-gradient-to-br from-brand-600 to-brand-800 rounded-xl flex items-center justify-center shadow-sm shadow-brand-500/25 ring-1 ring-white/20'>
            <HiOutlineOfficeBuilding className='w-4 h-4 text-white' />
          </div>
          <span className='font-display text-xl font-bold text-brand-950'>{t('signUp.realVista')}</span>
        </div>

        {/* Message */}
        <div className='text-center'>
          <h1 className='font-display text-xl font-bold text-brand-950 mb-2'>{t('signUp.registrationsClosed')}</h1>
          <p className='text-sm text-slate-500 leading-relaxed'>{t('signUp.newAccountsAreCreatedByInvitation')}</p>
        </div>

        {/* CTA */}
        <Button onClick={() => navigate('/sign-in')} className='w-full justify-center'>{t('signUp.goToSignIn')}</Button>
      </div>
    </div>
  );
}
