import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

import PrivateRoute from '../components/PrivateRoute';
import AdminRoute from '../components/AdminRoute';
import SellerRoute from '../components/SellerRoute';
import PermissionRoute from '../components/PermissionRoute';
import CrmShell from './CrmShell';

// ── Lazy page imports ─────────────────────────────────────────────────────────
// Public
const Home            = lazy(() => import('../pages/Home'));
const SignIn          = lazy(() => import('../pages/SignIn'));
const SignUp          = lazy(() => import('../pages/SignUp'));
const ForgotPassword  = lazy(() => import('../pages/ForgotPassword'));
const PasswordReset   = lazy(() => import('../pages/PasswordReset'));
const Unauthorized    = lazy(() => import('../pages/Unauthorized'));
const NotFound        = lazy(() => import('../pages/NotFound'));
const Listing         = lazy(() => import('../pages/Listing'));
const UserProfile     = lazy(() => import('../pages/UserProfile'));
const Search          = lazy(() => import('../pages/Search'));

// CRM — overview
const AgencyDashboard    = lazy(() => import('../pages/AgencyDashboard'));
const Analytics          = lazy(() => import('../pages/Analytics'));
const PortfolioDashboard = lazy(() => import('../pages/PortfolioDashboard'));
const Transactions       = lazy(() => import('../pages/Transactions'));

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
        <Route path='/listing/:listingId' element={<Listing />} />
        <Route path='/unauthorized' element={<Unauthorized />} />
        <Route path='/user/:userId' element={<UserProfile />} />

        {/* ── Authenticated ── */}
        <Route element={<PrivateRoute />}>
          <Route path='/search' element={<Search />} />
          <Route path='/password-reset' element={<PasswordReset />} />

          {/* ── CRM Shell (sidebar layout, admin/employee only) ── */}
          <Route element={<CrmShell />}>

            {/* Always visible to authenticated CRM users */}
            <Route path='/profile'  element={<Profile />} />
            <Route path='/settings' element={<Settings />} />
            <Route path='/messages' element={<Messages />} />
            <Route path='/tasks'    element={<TasksBoard />} />
            <Route path='/calendar' element={<Calendar />} />

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
