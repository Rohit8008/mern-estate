import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

import PrivateRoute from '../components/PrivateRoute';
import AdminRoute from '../components/AdminRoute';
import SellerRoute from '../components/SellerRoute';
import PermissionRoute from '../components/PermissionRoute';
import CrmShell from './CrmShell';
import ActingAwareLayout from './ActingAwareLayout';

// ── Lazy page imports ─────────────────────────────────────────────────────────
// Public
const Home            = lazy(() => import('../pages/Home'));
const SignIn          = lazy(() => import('../pages/SignIn'));
const SignUp          = lazy(() => import('../pages/SignUp'));
const ForgotPassword  = lazy(() => import('../pages/ForgotPassword'));
const PasswordReset   = lazy(() => import('../pages/PasswordReset'));
const Unauthorized    = lazy(() => import('../pages/Unauthorized'));
const NotFound        = lazy(() => import('../pages/NotFound'));
const Privacy         = lazy(() => import('../pages/Legal').then((m) => ({ default: m.Privacy })));
const Terms           = lazy(() => import('../pages/Legal').then((m) => ({ default: m.Terms })));
const Cookies         = lazy(() => import('../pages/Legal').then((m) => ({ default: m.Cookies })));
const Refunds         = lazy(() => import('../pages/Legal').then((m) => ({ default: m.Refunds })));
const DownloadApp     = lazy(() => import('../pages/DownloadApp'));
const Listing         = lazy(() => import('../pages/Listing'));
const UserProfile     = lazy(() => import('../pages/UserProfile'));
const Search          = lazy(() => import('../pages/Search'));
const SharedProperties = lazy(() => import('../pages/SharedProperties'));
const AcceptInvite = lazy(() => import('../pages/AcceptInvite'));
const Unsubscribe = lazy(() => import('../pages/Unsubscribe'));

// CRM — overview
const AgencyDashboard    = lazy(() => import('../pages/AgencyDashboard'));
const Analytics          = lazy(() => import('../pages/Analytics'));
const PortfolioDashboard = lazy(() => import('../pages/PortfolioDashboard'));
const Transactions       = lazy(() => import('../pages/Transactions'));
const Notifications      = lazy(() => import('../pages/Notifications'));
const AuditLog           = lazy(() => import('../pages/AuditLog'));
const LeadImport         = lazy(() => import('../pages/LeadImport'));

// CRM — properties
const PropertiesBoard      = lazy(() => import('../pages/PropertiesBoard'));
const CreateListing        = lazy(() => import('../pages/CreateListing'));
const UpdateListing        = lazy(() => import('../pages/UpdateListing'));
const DynamicListings      = lazy(() => import('../pages/DynamicListings'));
const Categories           = lazy(() => import('../pages/Categories'));
const CategoryListings     = lazy(() => import('../pages/CategoryListings'));

// CRM — contacts & pipeline
const ContactsBoard     = lazy(() => import('../pages/ContactsBoard'));
const OwnersBoard       = lazy(() => import('../pages/OwnersBoard'));
const ClientDetail      = lazy(() => import('../pages/ClientDetail'));
const DealsBoard        = lazy(() => import('../pages/DealsBoard'));
const BuyerRequirements = lazy(() => import('../pages/BuyerRequirements'));

// CRM — misc
const TasksBoard           = lazy(() => import('../pages/TasksBoard'));
const Calendar             = lazy(() => import('../pages/Calendar'));
const ClientReportTemplate = lazy(() => import('../pages/ClientReportTemplate'));
const Profile              = lazy(() => import('../pages/Profile'));
const Settings             = lazy(() => import('../pages/Settings'));
const Messages             = lazy(() => import('../pages/Messages'));

// Admin
const Admin                   = lazy(() => import('../pages/Admin'));
const AdminCategoryFields     = lazy(() => import('../pages/AdminCategoryFields'));
const AdminImport             = lazy(() => import('../pages/AdminImport'));
const PlatformConsole         = lazy(() => import('../pages/PlatformConsole'));
const PropertyTypeManagement  = lazy(() => import('../pages/PropertyTypeManagement'));

// ── Fallback ──────────────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className='flex items-center justify-center min-h-[60vh]'>
      <div className='w-6 h-6 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin' />
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route path='/' element={<Home />} />
        <Route path='/sign-in' element={<SignIn />} />
        <Route path='/sign-up' element={<SignUp />} />
        <Route path='/forgot-password' element={<ForgotPassword />} />
        <Route path='/privacy' element={<Privacy />} />
        <Route path='/terms' element={<Terms />} />
        <Route path='/cookies' element={<Cookies />} />
        <Route path='/refunds' element={<Refunds />} />
        {/* Public: the Android APK, while the app is not on the Play Store. */}
        <Route path='/download' element={<DownloadApp />} />
        {/* Formerly public. The property book is not browsable without a
            session; sharing specific properties goes through /s/:token. */}
        {/* The one page a stranger can reach. Outside AppShell on purpose: a
            recipient gets the properties they were sent and no way into the
            rest of the product. */}
        <Route path='/s/:token' element={<SharedProperties />} />

        {/* The other page a stranger can reach. The token carries the
            workspace, which is the only reason someone with no account and no
            idea which agency they belong to can get in at all. */}
        <Route path='/invite/:token' element={<AcceptInvite />} />

        {/* A lead with no account, from the link at the foot of a follow-up
            email. The signed token names the lead; the page does one thing. */}
        <Route path='/unsubscribe/:token' element={<Unsubscribe />} />

        <Route path='/unauthorized' element={<Unauthorized />} />

        {/* ── Authenticated ── */}
        <Route element={<PrivateRoute />}>
          {/* Shows a colleague's email and phone, so it belongs in here. It sat
              in the anonymous block above, next to the two routes that are
              deliberately reachable by a stranger. */}
          <Route path='/user/:userId' element={<UserProfile />} />
          {/* Search and the property page moved behind sign-in with the rest of
              the book. They sit outside CrmShell, so they carry the acting
              banner themselves — a platform operator must never see a
              customer's properties with nothing saying whose they are. */}
          <Route element={<ActingAwareLayout />}>
            <Route path='/search' element={<Search />} />
            <Route path='/password-reset' element={<PasswordReset />} />
          </Route>

          {/* ── CRM Shell (sidebar layout, admin/employee only) ── */}
          <Route element={<CrmShell />}>

            {/* Always visible to authenticated CRM users */}
            {/* The property page: inside the sidebar layout for staff, who open
                it from the CRM and lost their navigation on the way in. CrmShell
                renders it bare for anyone else, and AppShell gives them the
                public header (STAFF_PREFIXES). */}
            <Route path='/listing/:listingId' element={<Listing />} />
            <Route path='/profile'  element={<Profile />} />
            <Route path='/settings' element={<Settings />} />
            <Route path='/messages' element={<Messages />} />
            <Route path='/tasks'    element={<TasksBoard />} />
            <Route path='/calendar' element={<Calendar />} />
            <Route path='/notifications' element={<Notifications />} />

            {/* Overview */}
            <Route element={<PermissionRoute requires='viewAnalytics' />}>
              <Route path='/dashboard'    element={<AgencyDashboard />} />
              <Route path='/analytics'    element={<Analytics />} />
              <Route path='/portfolio'    element={<PortfolioDashboard />} />
              <Route path='/transactions' element={<Transactions />} />
            </Route>

            {/* Properties */}
            <Route element={<PermissionRoute requires='viewListings' />}>
              <Route path='/properties' element={<PropertiesBoard />} />
              <Route path='/dynamic-listings/:categorySlug' element={<DynamicListings />} />
            </Route>

            <Route element={<PermissionRoute requires='viewCategories' />}>
              <Route path='/categories' element={<Categories />} />
              <Route path='/category/:slug' element={<CategoryListings />} />
            </Route>

            <Route element={<PermissionRoute requires='createListing' />}>
              <Route path='/create-listing' element={<CreateListing />} />
            </Route>

            <Route element={<PermissionRoute requires='updateListing' />}>
              <Route path='/update-listing/:listingId' element={<UpdateListing />} />
            </Route>

            {/* CRM */}
            <Route element={<PermissionRoute requires='viewClients' />}>
              <Route path='/clients'     element={<ContactsBoard />} />
              <Route path='/clients/:id' element={<ClientDetail />} />
              <Route path='/pipeline'    element={<DealsBoard />} />
            </Route>

            <Route element={<PermissionRoute requires='viewOwners' />}>
              <Route path='/owners' element={<OwnersBoard />} />
            </Route>

            <Route element={<PermissionRoute requires='viewBuyerRequirements' />}>
              <Route path='/buyers'             element={<BuyerRequirements />} />
              <Route path='/buyer-requirements' element={<BuyerRequirements />} />
            </Route>

            <Route element={<PermissionRoute requires='exportData' />}>
              <Route path='/reports'        element={<ClientReportTemplate />} />
              <Route path='/client-reports' element={<ClientReportTemplate />} />
            </Route>

            {/* Admin-only routes — inside CRM shell so sidebar stays visible */}
            <Route element={<AdminRoute />}>
              <Route path='/admin' element={<Admin />} />
              <Route path='/admin/categories/:slug/fields' element={<AdminCategoryFields />} />
              <Route path='/admin/property-types' element={<PropertyTypeManagement />} />
              <Route path='/admin/import' element={<AdminImport />} />
              <Route path='/admin/audit-log' element={<AuditLog />} />
              <Route path='/admin/import-leads' element={<LeadImport />} />
              {/* The vendor's own console. Not in the tenant screen catalogue —
                  it is not something a workspace has, so it is gated on the
                  platform flag rather than on a feature. The API enforces it. */}
              <Route path='/platform' element={<PlatformConsole />} />
            </Route>
          </Route>
        </Route>

        {/* Sellers (non-CRM users) can still create/edit their own listings */}
        <Route element={<SellerRoute />}>
          <Route path='/create-listing' element={<CreateListing />} />
          <Route path='/update-listing/:listingId' element={<UpdateListing />} />
        </Route>

        <Route path='*' element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
