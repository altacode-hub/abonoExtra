import { get, ref } from 'firebase/database';
import React, { useState, useEffect } from 'react';
import { auth, db } from '../services/firebase';
import { isGeneralAdmin, isUnitAdmin } from '../services/rbac';

interface Props {
  uidUser?: string;
  unitCode?: string;
}

export const UserProfiles: React.FC<Props> = ({ uidUser, unitCode }) => {
  const [profile, setProfile] = useState<{ nomeGuerra?: string; nomeCompleto?: string } | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setAllowed(false);
        return;
      }
      const okGA = await isGeneralAdmin(user.uid);
      const okUA = await isUnitAdmin(user.uid);
      setAllowed(okGA || okUA);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!allowed) return;
    (async () => {
      try {
        const snap = await get(ref(db, `/users/${uidUser}/profile`));
        const val = snap.val() || {};
        setProfile({ nomeGuerra: val?.nomeGuerra.toUpperCase(), nomeCompleto: val?.nomeCompleto.toUpperCase()}); //rg: val?.rg, cpf: val?.cpf, mf: val?.mf });
      } catch {
        // sem permissão: mantém vazio e usa fallback UID
        setProfile({});
      }
      })();
  }, [allowed, uidUser]);

  if (allowed === null) return null;
  if (!allowed) return null;

  return (
    <span className="text-sm text-gray-text">{profile?.nomeCompleto}</span>
  );
};
