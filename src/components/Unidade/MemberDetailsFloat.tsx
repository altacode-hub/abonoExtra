import { useState } from 'react';
import { ref, set } from 'firebase/database';
import { db } from '../../services/firebase';
import { authorizeUser } from '../../services/rbac';

type Profile = {
  nomeGuerra?: string;
  nomeCompleto?: string;
  rg?: string;
  cpf?: string;
  mf?: string;
};

type Props = {
  unitCode: string;
  uid: string;
  profile?: Profile;
  isAdmin?: boolean;
  canPromote?: boolean; // Admin Geral
  onClose: () => void;
  onRemoved?: () => void;
};

export default function MemberDetailsFloat({ unitCode, uid, profile, isAdmin, canPromote, onClose, onRemoved }: Props) {
  const [promoting, setPromoting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const promote = async () => {
    if (!canPromote) return;
    setPromoting(true);
    try {
      await authorizeUser(uid, 'unitAdmin', unitCode);
      await set(ref(db, `/units/${unitCode}/admins/${uid}`), true);
    } catch {
      // silencia erros
    } finally {
      setPromoting(false);
    }
  };

  const demote = async () => {
    if (!canPromote) return;
    setPromoting(true);
    try {
      await set(ref(db, `/roles/${uid}/unitAdmin/${unitCode}`), null);
      await set(ref(db, `/units/${unitCode}/admins/${uid}`), null);
    } catch {
      // silencia erros
    } finally {
      setPromoting(false);
    }
  };

  const removeMember = async () => {
    setRemoving(true);
    try {
      await set(ref(db, `/units/${unitCode}/members/${uid}`), null);
      await set(ref(db, `/units/${unitCode}/banned/${uid}`), true);
      onRemoved?.();
      onClose();
    } catch {
      // silencia erros
    } finally {
      setRemoving(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="fixed bottom-6 right-6 w-80 bg-white border rounded-lg shadow-card p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-semibold text-gray-text flex items-center gap-2">
              <span>{profile?.nomeGuerra || uid}</span>
              {isAdmin && (
                <span className="text-xs px-2 py-0.5 rounded bg-secondary/10 text-secondary">Admin</span>
              )}
            </div>
            {profile?.nomeCompleto && (
              <div className="text-sm text-gray-light">{profile.nomeCompleto}</div>
            )}
          </div>
          <button className="text-sm text-secondary hover:underline" onClick={onClose}>Fechar</button>
        </div>

        <div className="mt-3 space-y-1 text-sm">
          {profile?.rg && <div><span className="text-gray-light">RG:</span> <span className="text-gray-text">{profile.rg}</span></div>}
          {profile?.cpf && <div><span className="text-gray-light">CPF:</span> <span className="text-gray-text">{profile.cpf}</span></div>}
          {profile?.mf && <div><span className="text-gray-light">MF:</span> <span className="text-gray-text">{profile.mf}</span></div>}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="px-3 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-60"
            onClick={isAdmin ? demote : promote}
            disabled={!canPromote || promoting}
            title={canPromote ? (isAdmin ? 'Despromover de Admin da unidade' : 'Promover a Admin da unidade') : 'Disponível apenas para Admin Geral'}
          >
            {promoting ? (isAdmin ? 'Despromovendo...' : 'Promovendo...') : (isAdmin ? 'Despromover de Admin' : 'Promover a Admin')}
          </button>

          <button
            className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60"
            onClick={() => setConfirmOpen(true)}
            disabled={removing}
            title="Excluir da unidade"
          >
            {removing ? 'Excluindo...' : 'Excluir da unidade'}
          </button>
        </div>

        {confirmOpen && (
          <div className="fixed inset-0 z-[80]">
            <div className="absolute inset-0" onClick={() => setConfirmOpen(false)} />
            <div className="fixed bottom-28 right-6 w-80 bg-white border rounded-lg shadow-card p-4">
              <div className="font-semibold text-gray-text mb-2">Tem certeza?</div>
              <div className="text-sm text-gray-light mb-3">Esta ação removerá o membro desta unidade e aplicará uma restrição para impedir re-adição.</div>
              <div className="flex justify-end gap-2">
                <button className="px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300" onClick={() => setConfirmOpen(false)}>Cancelar</button>
                <button className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60" onClick={removeMember} disabled={removing}>
                  {removing ? 'Removendo...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}