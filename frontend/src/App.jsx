import { BrowserRouter } from 'react-router-dom';

import { BuyerViewProvider } from './contexts/BuyerViewContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { AppearanceProvider } from './contexts/AppearanceProvider';
import ErrorBoundary from './components/ErrorBoundary';

import ApiErrorToastListener from './app/ApiErrorToastListener';
import AppRoutes from './app/AppRoutes';
import AppShell from './app/AppShell';
import AuthBootstrap from './app/AuthBootstrap';
import PushNotificationsListener from './app/PushNotificationsListener';

export default function App() {
  return (
    <ErrorBoundary>
      <AppearanceProvider>
        <NotificationProvider>
          <BuyerViewProvider>
            <BrowserRouter>
              <AuthBootstrap />
              <ApiErrorToastListener />
              <PushNotificationsListener />
              <AppShell>
                <AppRoutes />
              </AppShell>
            </BrowserRouter>
          </BuyerViewProvider>
        </NotificationProvider>
      </AppearanceProvider>
    </ErrorBoundary>
  );
}
