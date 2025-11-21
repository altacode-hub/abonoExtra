import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported } from 'firebase/messaging';
import { firebaseConfig } from './config';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getDatabase(app);

// Initialize storage with explicit bucket URL
const storageBucket = firebaseConfig.storageBucket;
console.log('Storage bucket from config:', storageBucket);
export const storage = getStorage(app, `gs://${storageBucket}`);

export const messagingPromise = isSupported().then((ok) => (ok ? getMessaging(app) : null));
// Ensure login persistence across sessions
setPersistence(auth, browserLocalPersistence).catch(() => {});