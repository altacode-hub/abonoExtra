import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';

const functions = getFunctions(app);

export const callInscricao = httpsCallable<{ missaoId: string; turnoId: string }, { ok: boolean; reason?: string }>(functions, 'onInscricaoRequest');
export const callCancelamento = httpsCallable<{ missaoId: string; turnoId: string }, { ok: boolean; reason?: string }>(functions, 'onCancelamento');
export const callSendEscalaNotification = httpsCallable<
  { unit?: string; date?: string; mission?: string; uids: string[]; title?: string; body?: string; link?: string },
  { ok: boolean; sent?: number; reason?: string }
>(functions, 'onSendEscalaNotification');
