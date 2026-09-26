import { combineReducers, configureStore } from '@reduxjs/toolkit';
import userReducer from './user/userSlice';
import { persistReducer, persistStore, createTransform } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { clearPersonalDeviceData } from '../utils/deviceData';

// Strip profile-form-only fields — they can be re-fetched when the profile page loads.
// Keeps _id, role, username, avatar, email, firstName, lastName for immediate render.
// Field names must match the user model exactly — this listed `addressLine`,
// which does not exist, so both real address lines were written to localStorage.
const stripProfileFields = createTransform(
  (inboundState) => {
    if (!inboundState.currentUser) return inboundState;
    const {
      bio,
      addressLine1,
      addressLine2,
      phone,
      company,
      website,
      city,
      country,
      postalCode,
      state: userState,
      assignedCategories,
      ...safe
    } = inboundState.currentUser;
    return { ...inboundState, currentUser: safe };
  },
  (outboundState) => outboundState,
  { whitelist: ['user'] }
);

const rootReducer = combineReducers({ user: userReducer });

const persistConfig = {
  key: 'root',
  storage,
  version: 1,
  transforms: [stripProfileFields],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export const persistor = persistStore(store);

// Whatever ends a session — sign-out, sign-out everywhere, account deletion, an
// expired refresh — lands here as currentUser going from someone to null.
// Clearing on that transition covers every path, including ones added later.
let signedIn = Boolean(store.getState().user?.currentUser);
store.subscribe(() => {
  const now = Boolean(store.getState().user?.currentUser);
  if (signedIn && !now) clearPersonalDeviceData();
  signedIn = now;
});
