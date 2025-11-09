import { set } from 'firebase/database';
import { db, auth } from './firebase';
import { isGeneralAdmin } from './rbac';
import { ref } from 'firebase/database';

type SeedUnit = { key: string; titulo: string; descricao?: string; cidade?: string };

const SEED_UNITS: SeedUnit[] = [
  {
    key: 'SUME16',
    titulo: '16º BPM – SUMÉ',
    descricao: 'Unidade do 16º BPM em Sumé',
    cidade: 'SUMÉ',
  },
  {
    key: 'CGR15X',
    titulo: '15º BPM – CAMPINA GRANDE',
    descricao: 'Unidade do 15º BPM em Campina Grande',
    cidade: 'CAMPINA GRANDE',
  },
  {
    key: 'PAT013',
    titulo: '13º BPM – PATOS',
    descricao: 'Unidade do 13º BPM em Patos',
    cidade: 'PATOS',
  },
];

export async function seedUnitsMeta(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Não autenticado');
  const ok = await isGeneralAdmin(uid);
  if (!ok) throw new Error('Permissão negada');

  for (const u of SEED_UNITS) {
    if (!/^[A-Z0-9]{6}$/.test(u.key)) {
      throw new Error(`Key inválida: ${u.key}`);
    }
    await set(ref(db, `/units/${u.key}/meta`), {
      titulo: u.titulo,
      descricao: u.descricao,
      cidade: u.cidade,
    });
  }
}