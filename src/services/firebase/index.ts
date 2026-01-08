import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { firebaseConfig } from './config';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined
if (!VAPID_KEY) {
    throw new Error("VAPID_KEY não configurado. Defina VITE_FIREBASE_VAPID_KEY no arquivo .env");
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getDatabase(app);

// Initialize storage with explicit bucket URL
const storageBucket = firebaseConfig.storageBucket;
console.log('Storage bucket from config:', storageBucket);
export const storage = getStorage(app, `gs://${storageBucket}`);

export const messagingPromise = isSupported()
    .then((ok) => { 
        if (ok) {
            console.log("Firebase messaging supported");
            return getMessaging(app)
        }else{
            return null
        };
    })
export const requestFCMToken = async () => {
    const ensureSw = async (): Promise<ServiceWorkerRegistration | null> => {
        if (!('serviceWorker' in navigator)) return null;
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
            try {
                reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
            } catch {
                reg = null;
            }
        }
        try {
            await navigator.serviceWorker.ready;
        } catch {}
        return reg || null;
    };
    const swReg = await ensureSw();
    return Notification.requestPermission()
    .then((permission) => {
        if (permission === 'granted') {
            return messagingPromise
                .then((messaging) => {
                    if (messaging) {
                        return getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg || undefined })
                            .then((token) => {
                                if (token) {
                                    console.log('FCM Token:', token);
                                    return token;
                                } else {
                                    console.log('Failed to generate FCM token');
                                    return null;
                                }
                            });
                    } else {
                        console.log('Firebase messaging not supported');
                        return null;
                    }
                });
        } else {
            console.log('User denied notification permission');
            return null;
        }
    });
}

export const onMessageListener = () => {
    return new Promise((resolve) => {
        messagingPromise.then((messaging) => {
            if (messaging) {
                onMessage(messaging, (payload) => {
                    try {
                        const title = (payload && payload.notification && payload.notification.title) || 'Nova notificação';
                        const body = (payload && payload.notification && payload.notification.body) || '';
                        if (Notification.permission === 'granted') {
                            new Notification(title, { body });
                        }
                    } catch {}
                    console.log('FCM (onMessage):', payload);
                    resolve(payload);
                });
            }else{
                console.log('Firebase messaging not supported');
            }
        });
    });
}
// Ensure login persistence across sessions
setPersistence(auth, browserLocalPersistence).catch(() => {});
