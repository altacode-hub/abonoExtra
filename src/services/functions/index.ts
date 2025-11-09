import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';

const functions = getFunctions(app);

export const callInscricao = httpsCallable<{ missaoId: string; turnoId: string }, { ok: boolean; reason?: string }>(functions, 'onInscricaoRequest');
export const callCancelamento = httpsCallable<{ missaoId: string; turnoId: string }, { ok: boolean; reason?: string }>(functions, 'onCancelamento');