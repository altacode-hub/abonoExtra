import { getToken, onMessage } from 'firebase/messaging'
import { messagingPromise, db } from './index'
import { firebaseConfig } from './config'
import { ref, set } from 'firebase/database'
import { auth } from './index'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined

export async function registerFcmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
    const senderId = firebaseConfig.messagingSenderId as any
    try {
      const target = reg.active || reg.waiting || reg.installing
      target?.postMessage?.({ type: 'FIREBASE_CONFIG', messagingSenderId: senderId })
      navigator.serviceWorker.ready.then((readyReg) => {
        try {
          readyReg.active?.postMessage?.({ type: 'FIREBASE_CONFIG', messagingSenderId: senderId })
        } catch {}
      })
    } catch {}
    return reg
  } catch {
    return null
  }
}

export async function ensureFcmTokenForUser(): Promise<string | null> {
  const user = auth.currentUser
  if (!user) return null
  const messaging = await messagingPromise
  if (!messaging) return null
  const swReg = await registerFcmServiceWorker()
  if (!swReg) return null
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    try {
      await set(ref(db, `/users/${user.uid}/fcmToken`), null)
    } catch {}
    return null
  }
  if (!VAPID_KEY) return null
  try {
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg })
    if (token) {
      await set(ref(db, `/users/${user.uid}/fcmToken`), token)
      return token
    }
    return null
  } catch {
    return null
  }
}

export async function listenForegroundMessages(handler?: (payload: any) => void): Promise<void> {
  const messaging = await messagingPromise
  if (!messaging) return
  onMessage(messaging, (payload) => {
    if (handler) {
      handler(payload)
      return
    }
    const title = payload.notification?.title || 'Nova notificação'
    const body = payload.notification?.body || ''
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body })
      } catch {}
    }
    console.log('FCM (foreground):', payload)
  })
}

export function startFcmTokenAutoRefresh(): void {
  const attempt = () => {
    ensureFcmTokenForUser().catch(() => {})
  }
  window.addEventListener('focus', attempt)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') attempt()
  })
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      attempt()
    })
  }
}

export async function ensureFcmTokenForUserWithStatus(): Promise<{ ok: boolean; token: string | null; reason?: string; message?: string }> {
  const user = auth.currentUser
  if (!user) return { ok: false, token: null, reason: 'not-logged', message: 'Usuário não autenticado.' }
  const messaging = await messagingPromise
  if (!messaging) return { ok: false, token: null, reason: 'messaging-not-supported', message: 'Seu navegador não suporta notificações push.' }
  const swReg = await registerFcmServiceWorker()
  if (!swReg) return { ok: false, token: null, reason: 'sw-register-failed', message: 'Falha ao registrar o Service Worker.' }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    try { await set(ref(db, `/users/${user.uid}/fcmToken`), null) } catch {}
    return { ok: false, token: null, reason: 'permission-denied', message: 'Conceda permissão no seu navegador para receber notificações.' }
  }
  if (!VAPID_KEY) return { ok: false, token: null, reason: 'vapid-missing', message: 'Chave VAPID não configurada.' }
  try {
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg })
    if (token) {
      try { await set(ref(db, `/users/${user.uid}/fcmToken`), token) } catch {}
      return { ok: true, token }
    }
    return { ok: false, token: null, reason: 'empty-token', message: 'Não foi possível obter o token.' }
  } catch (e: any) {
    return { ok: false, token: null, reason: 'get-token-error', message: 'Erro ao obter o token FCM.' }
  }
}
