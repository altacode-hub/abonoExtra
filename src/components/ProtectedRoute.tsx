import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { auth } from '../services/firebase';
import { isGeneralAdmin, isUnitAdmin } from '../services/rbac';

type Props = {
  children: React.ReactNode;
  requireGeneralAdmin?: boolean;
  requireUnitAdmin?: boolean;
};

export default function ProtectedRoute({ children, requireGeneralAdmin, requireUnitAdmin }: Props) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (userState) => {
      const user = userState;
      if (!user) {
        setAllowed(false);
        return;
      }
      if (requireGeneralAdmin) {
        const ok = await isGeneralAdmin(user.uid);
        setAllowed(ok);
        return;
      }
      if (requireUnitAdmin) {
        const ok = await isUnitAdmin(user.uid);
        setAllowed(ok);
        return;
      }
      setAllowed(true);
    });
    return () => unsub();
  }, [requireGeneralAdmin, requireUnitAdmin]);

  if (allowed === null) return null;
  if (!allowed) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}