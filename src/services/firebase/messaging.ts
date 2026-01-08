import { getToken, onMessage } from 'firebase/messaging'
import { messagingPromise, db } from './index'
import { firebaseConfig } from './config'
import { ref, set, get, update } from 'firebase/database'
import { auth } from './index'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined
const RESET_SW = String(import.meta.env.VITE_FCM_RESET_SW || '').toLowerCase() === 'true'

function ensureDeviceId(): string {
  try {
    const key = 'fcmDeviceId'
    let val = localStorage.getItem(key)
    if (!val) {
      const rand = Math.random().toString(36).slice(2) + Date.now().toString(36)
      val = rand
      localStorage.setItem(key, val)
    }
    return String(val)
  } catch {
    return 'unknown'
  }
}

export async function registerFcmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    if (RESET_SW) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(
          regs.map(async (reg) => {
            const sw = (reg.active || reg.installing || reg.waiting) as any
            const url = sw?.scriptURL || ''
            if (url.includes('/firebase-messaging-sw.js')) {
              await reg.unregister()
            }
          })
        )
      } catch {}
    }
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
  try {
    await navigator.serviceWorker.ready
  } catch {}
  const readyReg = (await navigator.serviceWorker.ready).active ? (await navigator.serviceWorker.ready) : swReg
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    try {
      await set(ref(db, `/users/${user.uid}/fcmToken`), null)
    } catch {}
    return null
  }
  if (!VAPID_KEY) return null
  try {
    const token = false //await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: readyReg })
    if (token) {
      const deviceId = ensureDeviceId()
      try {
        const deviceRef = ref(db, `/users/${user.uid}/fcmDevices/${deviceId}`)
        const snap = await get(deviceRef)
        const prev = snap.val() || {}
        if (prev?.token !== token) {
          await set(deviceRef, { token, active: !!prev?.active, lastUpdated: Date.now() })
        } else {
          await update(deviceRef, { lastSeen: Date.now() })
        }
      } catch {}
      try { await set(ref(db, `/users/${user.uid}/fcmToken`), token) } catch {}
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
  const swReg = await registerFcmServiceWorker()
  try { await navigator.serviceWorker.ready } catch {}
  const readyReg = (await navigator.serviceWorker.ready).active ? (await navigator.serviceWorker.ready) : swReg
  if (VAPID_KEY) {
    try {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: readyReg })
      console.log(token)
    } catch {}
  }
  onMessage(messaging, (payload) => {
    if (handler) {
      handler(payload)
      console.log(payload)
      return
    }
    const title = payload.notification?.title || 'Nova notificação'
    const body = payload.notification?.body || ''
    if (Notification.permission === 'granted') {
      console.log("messaging.ts")
      try {
        new Notification(title, { body })
      } catch {}
    }else{
      console.log(Notification.permission)
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
    try {
      await navigator.serviceWorker.ready
    } catch {}
    const readyReg = (await navigator.serviceWorker.ready).active ? (await navigator.serviceWorker.ready) : swReg
    const token = false //await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: readyReg })
    if (token) {
      const deviceId = ensureDeviceId()
      try {
        const deviceRef = ref(db, `/users/${user.uid}/fcmDevices/${deviceId}`)
        const snap = await get(deviceRef)
        const prev = snap.val() || {}
        if (prev?.token !== token) {
          await set(deviceRef, { token, active: !!prev?.active, lastUpdated: Date.now() })
        } else {
          await update(deviceRef, { lastSeen: Date.now() })
        }
      } catch {}
      //try { await set(ref(db, `/users/${user.uid}/fcmToken`), token) } catch {}
      return { ok: true, token }
    }
    return { ok: false, token: null, reason: 'empty-token', message: 'Não foi possível obter o token.' }
  } catch (e: any) {
    return { ok: false, token: null, reason: 'get-token-error', message: 'Erro ao obter o token FCM.' }
  }
}

export function getCurrentDeviceId(): string {
  return ensureDeviceId()
}

export async function getCurrentDeviceActivation(): Promise<boolean> {
  const uid = auth.currentUser?.uid
  if (!uid) return false
  try {
    const deviceId = ensureDeviceId()
    const snap = await get(ref(db, `/users/${uid}/fcmDevices/${deviceId}/active`))
    const val = snap.val()
    return !!val
  } catch {
    return false
  }
}

export async function activateCurrentDevice(): Promise<boolean> {
  const uid = auth.currentUser?.uid
  if (!uid) return false
  try {
    const deviceId = ensureDeviceId()
    const deviceRef = ref(db, `/users/${uid}/fcmDevices/${deviceId}`)
    const snap = await get(deviceRef)
    const prev = snap.val() || {}
    if (!prev?.token) {
      await ensureFcmTokenForUser().catch(() => {})
    }
    await update(deviceRef, { active: true, activatedAt: Date.now() })
    return true
  } catch {
    return false
  }
}
