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
    <div className='min-h-[calc(100vh-3.5rem)] bg-slate-50 flex items-center justify-center p-4'>
      <div className='bg-white rounded-2xl shadow-md border border-slate-200 w-full max-w-sm p-8 flex flex-col items-center gap-6'>
        {/* Logo */}
        <div className='flex items-center gap-2'>
          <div className='w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center'>
            <HiOutlineOfficeBuilding className='w-4 h-4 text-white' />
          </div>
          <span className='text-xl font-bold text-slate-900'>{t('signUp.realVista')}</span>
        </div>

        {/* Message */}
        <div className='text-center'>
          <h1 className='text-xl font-bold text-slate-900 mb-2'>{t('signUp.registrationsClosed')}</h1>
          <p className='text-sm text-slate-500 leading-relaxed'>{t('signUp.newAccountsAreCreatedByInvitation')}</p>
        </div>

        {/* CTA */}
        <Button onClick={() => navigate('/sign-in')} className='w-full justify-center'>{t('signUp.goToSignIn')}</Button>
      </div>
    </div>
  );
}
