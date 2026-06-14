import { BrowserRouter } from 'react-router-dom';

import { BuyerViewProvider } from './contexts/BuyerViewContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { AppearanceProvider } from './contexts/AppearanceProvider';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { SearchProvider }      from './contexts/SearchContext';
import GlobalSearch            from './components/GlobalSearch';
import ErrorBoundary from './components/ErrorBoundary';

import ApiErrorToastListener from './app/ApiErrorToastListener';
import AppRoutes from './app/AppRoutes';
import AppShell from './app/AppShell';
import AuthBootstrap from './app/AuthBootstrap';
import PushNotificationsListener from './app/PushNotificationsListener';
import CmdKListener from './app/CmdKListener';

export default function App() {
  return (
    <ErrorBoundary>
      <AppearanceProvider>
        <NotificationProvider>
            <BuyerViewProvider>
              <BrowserRouter>
                <PermissionsProvider>
                  <SearchProvider>
                    <AuthBootstrap />
                    <ApiErrorToastListener />
                    <PushNotificationsListener />
                    <CmdKListener />
                    <GlobalSearch />
                    <AppShell>
                      <AppRoutes />
                    </AppShell>
                  </SearchProvider>
                </PermissionsProvider>
              </BrowserRouter>
            </BuyerViewProvider>
        </NotificationProvider>
      </AppearanceProvider>
    </ErrorBoundary>
  );
}
