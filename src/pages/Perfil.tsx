import { useEffect, useState } from 'react';
import { onValue, ref, update } from 'firebase/database';
import { auth, db } from '../services/firebase';
import { ensureFcmTokenForUserWithStatus, getCurrentDeviceId, activateCurrentDevice } from '../services/firebase/messaging';
import PageHeader from '../components/PageHeader';

type PerfilData = {
  photo?: string;
  nomeCompleto?: string;
  nomeGuerra?: string;
  rg?: string;
  cpf?: string;
  mf?: string;
  dataNascimento?: string; // ISO yyyy-mm-dd
  phone?: string; // E.164 digits only
};

export default function Perfil() {
  const [perfil, setPerfil] = useState<PerfilData>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [fcmRefreshing, setFcmRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fcmMessage, setFcmMessage] = useState<string | null>(null);
  const [deviceActive, setDeviceActive] = useState<boolean>(false);
  const [activating, setActivating] = useState<boolean>(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const required = ['nomeCompleto', 'nomeGuerra', 'rg', 'cpf', 'mf', 'dataNascimento', 'phone'] as const;
  const isComplete = required.every((k) => String((perfil as any)[k] || '').trim().length > 0);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const r = ref(db, `/users/${uid}/profile`);
    const unsub = onValue(r, (snap) => {
      const val = snap.val() || {};
      setPerfil(val);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const r = ref(db, `/users/${uid}/fcmToken`);
    const unsub = onValue(r, (snap) => {
      const val = snap.val();
      setFcmToken(val ? String(val) : null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const id = getCurrentDeviceId();
    setDeviceId(id);
    const r = ref(db, `/users/${uid}/fcmDevices/${id}/active`);
    const unsub = onValue(r, (snap) => {
      const val = snap.val();
      setDeviceActive(!!val);
    });
    return () => unsub();
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPerfil((p) => ({ ...p, photo: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    if (!isComplete) {
      setSaveMessage('Preencha todos os campos obrigatórios.');
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }
    setSaving(true);
    try {
      await update(ref(db, `/users/${uid}/profile`), perfil as any);
      setSaveMessage('Dados salvos com sucesso.');
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const refreshFcm = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setFcmRefreshing(true);
    try {
      const res = await ensureFcmTokenForUserWithStatus();
      setFcmMessage(res.message || (res.ok ? 'Token atualizado.' : 'Falha ao atualizar token.'));
    } finally {
      setFcmRefreshing(false);
    }
  };

  const copyFcm = async () => {
    if (!fcmToken) return;
    try {
      await navigator.clipboard.writeText(fcmToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const activateDevice = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setActivating(true);
    try {
      const ok = await activateCurrentDevice();
      setFcmMessage(ok ? 'Este dispositivo foi ativado para receber notificações.' : 'Falha ao ativar este dispositivo.');
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px]">
      <PageHeader title="Perfil" />
      <div className="px-4 py-4 flex items-center justify-center min-h-[calc(100vh-68px)]">
        <div className="bg-white border rounded-lg p-6 flex flex-col gap-4 w-full max-w-xl shadow-card">
          {!isComplete && (
            <div className="rounded border border-yellow-300 bg-yellow-50 text-yellow-900 p-3">
              Para continuar usando o sistema, preencha todos os campos abaixo e clique em Salvar.
            </div>
          )}
          <div className="text-sm text-gray-light">Todos os campos são obrigatórios.</div>

          <label className="flex flex-col gap-1">
            <span className="text-secondary text-sm">Nome completo</span>
            <input required aria-required className="bg-white border rounded px-3 py-2" value={perfil.nomeCompleto || ''} onChange={(e) => setPerfil({ ...perfil, nomeCompleto: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-secondary text-sm">Nome de guerra</span>
            <input required aria-required className="bg-white border rounded px-3 py-2" value={perfil.nomeGuerra || ''} onChange={(e) => setPerfil({ ...perfil, nomeGuerra: e.target.value })} />
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-sm">RG</span>
              <input required aria-required className="bg-white border rounded px-3 py-2" value={perfil.rg || ''} onChange={(e) => setPerfil({ ...perfil, rg: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-sm">CPF</span>
              <input required aria-required className="bg-white border rounded px-3 py-2" value={perfil.cpf || ''} onChange={(e) => setPerfil({ ...perfil, cpf: e.target.value })} />
          </label>
        </div>

          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-sm">Matrícula Funcional (MF)</span>
              <input required aria-required className="bg-white border rounded px-3 py-2" value={perfil.mf || ''} onChange={(e) => setPerfil({ ...perfil, mf: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-sm">Data de Nascimento</span>
              <input required aria-required type="date" className="bg-white border rounded px-3 py-2" value={perfil.dataNascimento || ''} onChange={(e) => setPerfil({ ...perfil, dataNascimento: e.target.value })} />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-sm">Telefone (WhatsApp)</span>
              <input
                required aria-required
                className="bg-white border rounded px-3 py-2"
                placeholder="Ex.: 5591999999999"
                value={perfil.phone || ''}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, '');
                  setPerfil({ ...perfil, phone: digits });
                }}
              />
              <span className="text-xs text-gray-light">Formato E.164 sem símbolos (apenas dígitos).</span>
              <div className="flex items-center justify-between gap-2 mt-2">
                <div className="text-xs text-gray-light break-all">FCM Token: {fcmToken || '—'}</div>
                <button onClick={refreshFcm} aria-label="Atualizar FCM Token" disabled={fcmRefreshing} className="px-2 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-60">
                  {fcmRefreshing ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4 animate-spin"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4"><path d="M21 12a9 9 0 1 1-3.18-6.82"/><polyline points="21 3 21 12 12 12"/></svg>
                  )}
                </button>
                <button onClick={copyFcm} aria-label="Copiar FCM Token" disabled={!fcmToken} className="px-2 py-2 bg-secondary text-white rounded hover:bg-secondary-dark disabled:opacity-60">
                  {copied ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-4 h-4"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  )}
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className={`text-xs ${deviceActive ? 'text-green-700' : 'text-yellow-700'}`}>
                  {deviceActive ? 'Este dispositivo está ativo para receber notificações.' : 'Este dispositivo não está ativo para receber notificações.'}
                </span>
                {!deviceActive && (
                  <button onClick={activateDevice} disabled={activating} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">
                    {activating ? 'Ativando...' : 'Ativar este dispositivo'}
                  </button>
                )}
              </div>
              {fcmMessage && <div className="text-xs text-yellow-700 mt-1">{fcmMessage}</div>}
            </label>
          </div>

          <div className="flex flex-col items-end">
            <button onClick={save} disabled={saving || !isComplete} className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-60">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            {saveMessage && (
              <span className="mt-1 text-sm text-green-700">{saveMessage}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
