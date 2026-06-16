import { combineReducers, configureStore } from '@reduxjs/toolkit';
import userReducer from './user/userSlice';
import { persistReducer, persistStore, createTransform } from 'redux-persist';
import storage from 'redux-persist/lib/storage';

// Strip profile-form-only fields — they can be re-fetched when the profile page loads.
// Keeps _id, role, username, avatar, email, firstName, lastName for immediate render.
const stripProfileFields = createTransform(
  (inboundState) => {
    if (!inboundState.currentUser) return inboundState;
    const {
      bio,
      addressLine,
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
