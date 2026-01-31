// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';

// Firebase configuration from environment variables
// In development, create a .env.local file with these values
// In production, set these as environment variables in your deployment platform
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Validate required Firebase config in development
if (import.meta.env.DEV) {
  const requiredKeys = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET'];
  const missing = requiredKeys.filter(key => !import.meta.env[key]);
  if (missing.length > 0) {
    console.warn(
      `Missing Firebase environment variables: ${missing.join(', ')}\n` +
      'Create a .env.local file with your Firebase credentials. See .env.example for reference.'
    );
  }
}

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
