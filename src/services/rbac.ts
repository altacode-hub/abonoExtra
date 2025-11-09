import { ref, get, set, update } from 'firebase/database';
import { auth, db } from './firebase';

export const GENERAL_ADMIN_UID = 'sr692NnyYFV1EtCPZqTou7dO24z2';

export type RoleKey = 'generalAdmin' | 'unitAdmin' | 'unitMember';
export type UnitMeta = { titulo: string; descricao?: string; cidade?: string };

export async function isGeneralAdmin(uid?: string): Promise<boolean> {
  const currentUid = uid || auth.currentUser?.uid;
  if (!currentUid) return false;
  if (currentUid === GENERAL_ADMIN_UID) return true;
  const snap = await get(ref(db, `/roles/${currentUid}/generalAdmin`));
  return snap.val() === true;
}

export async function ensureSeedGeneralAdmin(): Promise<void> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid || currentUid !== GENERAL_ADMIN_UID) return;
  const snap = await get(ref(db, `/roles/${currentUid}/generalAdmin`));
  if (snap.exists()) return;
  await set(ref(db, `/roles/${currentUid}/generalAdmin`), true);
}

export async function authorizeUser(
  targetUid: string,
  role: RoleKey,
  unitCode?: string
): Promise<void> {
  const adminUid = auth.currentUser?.uid;
  if (!adminUid) throw new Error('Não autenticado');
  const allowed = await isGeneralAdmin(adminUid);
  if (!allowed) throw new Error('Permissão negada');

  if (role === 'generalAdmin') {
    await set(ref(db, `/roles/${targetUid}/generalAdmin`), true);
    return;
  }

  if (!unitCode) throw new Error('Código da unidade obrigatório');
  if (role === 'unitAdmin') {
    await Promise.all([
      set(ref(db, `/roles/${targetUid}/unitAdmin/${unitCode}`), true),
      set(ref(db, `/units/${unitCode}/admins/${targetUid}`), true),
    ]);
    return;
  }

  if (role === 'unitMember') {
    await Promise.all([
      set(ref(db, `/roles/${targetUid}/unitMember/${unitCode}`), true),
      set(ref(db, `/units/${unitCode}/members/${targetUid}`), true),
    ]);
    return;
  }
}

export async function registerUnitCodeForCurrentUser(unitCode: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Não autenticado');
  await Promise.all([
    update(ref(db, `/roles/${uid}/unitMember`), { [unitCode]: true }),
    update(ref(db, `/units/${unitCode}/members`), { [uid]: true }),
  ]);
}

export async function getUnitMeta(unitCode: string): Promise<UnitMeta | null> {
  const snap = await get(ref(db, `/units/${unitCode}/meta`));
  return snap.exists() ? (snap.val() as UnitMeta) : null;
}

export async function addUnitToUserFromCode(unitCode: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Não autenticado');
  // bloqueia se usuário estiver banido da unidade
  const bannedSnap = await get(ref(db, `/units/${unitCode}/banned/${uid}`));
  if (bannedSnap.exists() && bannedSnap.val() === true) {
    throw new Error('Você não pode adicionar esta unidade (restrição aplicada).');
  }
  const meta = await getUnitMeta(unitCode);
  if (!meta) throw new Error('Código de unidade inválido');
  await Promise.all([
    // vincula membro
    update(ref(db, `/roles/${uid}/unitMember`), { [unitCode]: true }),
    update(ref(db, `/units/${unitCode}/members`), { [uid]: true }),
    // salva na lista do usuário
    set(ref(db, `/users/${uid}/units/${unitCode}`), meta),
  ]);
}

export async function removeUnitFromUserByCode(unitCode: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Não autenticado');
  await Promise.all([
    set(ref(db, `/users/${uid}/units/${unitCode}`), null),
    set(ref(db, `/roles/${uid}/unitMember/${unitCode}`), null),
    set(ref(db, `/units/${unitCode}/members/${uid}`), null),
  ]);
}

// Helpers para verificar papéis agregados
export async function isUnitAdmin(uid?: string): Promise<boolean> {
  const currentUid = uid || auth.currentUser?.uid;
  if (!currentUid) return false;
  const snap = await get(ref(db, `/roles/${currentUid}/unitAdmin`));
  const val = snap.val();
  return !!val && Object.keys(val).length > 0;
}

export async function isUnitMember(uid?: string): Promise<boolean> {
  const currentUid = uid || auth.currentUser?.uid;
  if (!currentUid) return false;
  const snap = await get(ref(db, `/roles/${currentUid}/unitMember`));
  const val = snap.val();
  return !!val && Object.keys(val).length > 0;
}

// Gera um código único de 6 caracteres (A-Z, 0-9)
async function generateUniqueUnitCode(): Promise<string> {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const makeCode = () => Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  // tenta até encontrar um código não utilizado
  // em casos extremamente raros, pode precisar de algumas iterações
  for (let i = 0; i < 50; i++) {
    const code = makeCode();
    const snap = await get(ref(db, `/units/${code}/meta`));
    if (!snap.exists()) return code;
  }
  throw new Error('Não foi possível gerar código de unidade único');
}

// Cria uma nova unidade e vincula o usuário atual como Admin Unidade e Membro
export async function createUnitForCurrentUser(meta: UnitMeta): Promise<{ code: string }> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Não autenticado');
  const code = await generateUniqueUnitCode();
  // salva meta da unidade
  await set(ref(db, `/units/${code}/meta`), meta);
  // vincula papéis (admin e membro) e lista do usuário
  await Promise.all([
    update(ref(db, `/roles/${uid}/unitAdmin`), { [code]: true }),
    update(ref(db, `/roles/${uid}/unitMember`), { [code]: true }),
    update(ref(db, `/units/${code}/members`), { [uid]: true }),
    set(ref(db, `/users/${uid}/units/${code}`), meta),
  ]);
  return { code };
}