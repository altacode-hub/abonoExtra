import { useEffect, useState } from 'react';
import { get, onValue, ref } from 'firebase/database';
import { auth, db } from '../../services/firebase';
import { isGeneralAdmin } from '../../services/rbac';
import MemberDetailsFloat from './MemberDetailsFloat';

type MembersMap = Record<string, boolean>;

type Props = {
  unitCode: string;
};

export default function UnitMembersSection({ unitCode }: Props) {
  const [members, setMembers] = useState<MembersMap>({});
  const [profiles, setProfiles] = useState<Record<string, { nomeGuerra?: string; nomeCompleto?: string }>>({});
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [isGA, setIsGA] = useState(false);
  const [admins, setAdmins] = useState<Record<string, boolean>>({});
  const currentUid = auth.currentUser?.uid;

  useEffect(() => {
    if (!unitCode) return;
    const r = ref(db, `/units/${unitCode}/members`);
    const unsub = onValue(r, (snap) => setMembers(snap.val() || {}));
    return () => unsub();
  }, [unitCode]);

  useEffect(() => {
    if (!unitCode) return;
    const r = ref(db, `/units/${unitCode}/admins`);
    const unsub = onValue(r, (snap) => setAdmins(snap.val() || {}));
    return () => unsub();
  }, [unitCode]);

  // Checa se usuário atual é Admin Geral para habilitar ações avançadas
  useEffect(() => {
    isGeneralAdmin().then(setIsGA).catch(() => setIsGA(false));
  }, []);

  // Carrega perfis (nome de guerra) dos membros quando a lista muda
  useEffect(() => {
    const memberUids = Object.keys(members || {});
    if (memberUids.length === 0) {
      setProfiles({});
      return;
    }
    (async () => {
      const result: Record<string, { nomeGuerra?: string; nomeCompleto?: string; rg?: string; cpf?: string; mf?: string }> = {};
      for (const uid of memberUids) {
        try {
          const snap = await get(ref(db, `/users/${uid}/profile`));
          const val = snap.val() || {};
          result[uid] = { nomeGuerra: val?.nomeGuerra, nomeCompleto: val?.nomeCompleto, rg: val?.rg, cpf: val?.cpf, mf: val?.mf };
        } catch {
          // sem permissão: mantém vazio e usa fallback UID
          result[uid] = {};
        }
      }
      setProfiles(result);
    })();
  }, [members]);

  const memberUids = Object.keys(members || {});

  return (
    <section className="bg-white border rounded-lg p-6 shadow-card">
      <h2 className="text-lg font-semibold text-gray-text mb-2">Membros da Unidade</h2>
      {memberUids.length === 0 ? (
        <p className="text-sm text-gray-light">Nenhum membro vinculado a esta unidade.</p>
      ) : (
        <ul className="divide-y">
          {memberUids.map((uid) => (
            <li
              key={uid}
              className="py-3 text-gray-text flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => setSelectedUid(uid)}
            >
              <div>
                <div className="font-medium flex items-center gap-2">
                  <span>{profiles[uid]?.nomeGuerra || uid}</span>
                  {admins[uid] && (
                    <span className="text-xs px-2 py-0.5 rounded bg-secondary/10 text-secondary">Admin</span>
                  )}
                </div>
                {currentUid === uid && (
                  <div className="text-sm text-gray-light">Você</div>
                )}
              </div>
              <svg className="w-4 h-4 text-gray-light" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </li>
          ))}
        </ul>
      )}

      {selectedUid && (
        <MemberDetailsFloat
          unitCode={unitCode}
          uid={selectedUid}
          profile={profiles[selectedUid]}
          isAdmin={!!admins[selectedUid]}
          canPromote={isGA}
          onClose={() => setSelectedUid(null)}
          onRemoved={() => setSelectedUid(null)}
        />
      )}
    </section>
  );
}