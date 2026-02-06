import { Routes, Route } from 'react-router-dom';

import Home from '../pages/Home';
import SignIn from '../pages/SignIn';
import SignUp from '../pages/SignUp';
import Profile from '../pages/Profile';
import PrivateRoute from '../components/PrivateRoute';
import SellerRoute from '../components/SellerRoute';
import CreateListing from '../pages/CreateListing';
import UpdateListing from '../pages/UpdateListing';
import Listing from '../pages/Listing';
import Search from '../pages/Search';
import Categories from '../pages/Categories';
import CategoryListings from '../pages/CategoryListings';
import AdminRoute from '../components/AdminRoute';
import Admin from '../pages/Admin';
import UserProfile from '../pages/UserProfile';
import Messages from '../pages/Messages';
import AdminCategoryFields from '../pages/AdminCategoryFields';
import AdminImport from '../pages/AdminImport';
import DynamicListings from '../pages/DynamicListings';
import PasswordReset from '../pages/PasswordReset';
import ForgotPassword from '../pages/ForgotPassword';
import Unauthorized from '../pages/Unauthorized';
import NotFound from '../pages/NotFound';
import BuyerRequirements from '../pages/BuyerRequirements';
import Clients from '../pages/Clients';
import ClientDetail from '../pages/ClientDetail';
import AdminDashboard from '../pages/AdminDashboard';
import TeamDashboard from '../pages/TeamDashboard';
import Analytics from '../pages/Analytics';
import PropertyTypeManagement from '../pages/PropertyTypeManagement';
import Settings from '../pages/Settings';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path='/' element={<Home />} />
      <Route path='/sign-in' element={<div className='-mt-16'><SignIn /></div>} />
      <Route path='/sign-up' element={<div className='-mt-16'><SignUp /></div>} />
      <Route path='/forgot-password' element={<div className='-mt-16'><ForgotPassword /></div>} />
      <Route path='/listing/:listingId' element={<Listing />} />
      <Route path='/unauthorized' element={<Unauthorized />} />

      <Route element={<PrivateRoute />}>
        <Route path='/search' element={<Search />} />
        <Route path='/categories' element={<Categories />} />
        <Route path='/category/:slug' element={<CategoryListings />} />
        <Route path='/dynamic-listings/:categorySlug' element={<DynamicListings />} />
        <Route path='/dashboard' element={<TeamDashboard />} />
        <Route path='/clients' element={<Clients />} />
        <Route path='/clients/:id' element={<ClientDetail />} />
      </Route>

      <Route path='/buyer-requirements' element={<BuyerRequirements />} />
      <Route path='/user/:userId' element={<UserProfile />} />

      <Route element={<PrivateRoute />}>
        <Route path='/messages' element={<Messages />} />
      </Route>

      <Route element={<AdminRoute />}>
        <Route path='/admin' element={<Admin />} />
        <Route path='/admin/dashboard' element={<AdminDashboard />} />
        <Route path='/admin/analytics' element={<Analytics />} />
        <Route path='/admin/categories/:slug/fields' element={<AdminCategoryFields />} />
        <Route path='/admin/property-types' element={<PropertyTypeManagement />} />
        <Route path='/admin/import' element={<AdminImport />} />
      </Route>

      <Route element={<PrivateRoute />}>
        <Route path='/profile' element={<Profile />} />
        <Route path='/settings' element={<Settings />} />
        <Route path='/password-reset' element={<PasswordReset />} />
      </Route>

      <Route element={<SellerRoute />}>
        <Route path='/create-listing' element={<CreateListing />} />
        <Route path='/update-listing/:listingId' element={<UpdateListing />} />
      </Route>

      <Route path='*' element={<NotFound />} />
    </Routes>
  );
}
