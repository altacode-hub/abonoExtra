import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { auth, db } from '../services/firebase';
import { get, ref, onValue } from 'firebase/database';
import { isGeneralAdmin, isUnitAdmin } from '../services/rbac';

type Props = {
  children: React.ReactNode;
  requireGeneralAdmin?: boolean;
  requireUnitAdmin?: boolean;
};

export default function ProtectedRoute({ children, requireGeneralAdmin, requireUnitAdmin }: Props) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [profileOk, setProfileOk] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    let profileUnsub: (() => void) | null = null;
    const unsub = auth.onAuthStateChanged(async (userState) => {
      const user = userState;
      if (!user) {
        setAllowed(false);
        setProfileOk(null);
        if (profileUnsub) {
          profileUnsub();
          profileUnsub = null;
        }
        return;
      }
      let ok = true;
      if (requireGeneralAdmin) ok = await isGeneralAdmin(user.uid);
      if (requireUnitAdmin) ok = await isUnitAdmin(user.uid);
      setAllowed(ok);
      if (!ok) {
        setProfileOk(null);
        if (profileUnsub) {
          profileUnsub();
          profileUnsub = null;
        }
        return;
      }
      if (profileUnsub) profileUnsub();
      const r = ref(db, `/users/${user.uid}/profile`);
      profileUnsub = onValue(r, (snap) => {
        const val = snap.val() || {};
        const required = ['nomeCompleto', 'nomeGuerra', 'rg', 'cpf', 'mf', 'dataNascimento', 'phone'] as const;
        const okProfile = required.every((k) => String(val?.[k] || '').trim().length > 0);
        setProfileOk(okProfile);
      });
    });
    return () => {
      if (profileUnsub) profileUnsub();
      unsub();
    };
  }, [requireGeneralAdmin, requireUnitAdmin]);

  if (allowed === null) return null;
  if (!allowed) return <Navigate to="/login" state={{ from: location }} replace />;
  if (location.pathname !== '/perfil' && profileOk === false) return <Navigate to="/perfil" replace />;
  if (profileOk === null && location.pathname !== '/perfil') return null;
  return <>{children}</>;
}
