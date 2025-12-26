import { useEffect, useState } from 'react';
import { onValue, ref, update } from 'firebase/database';
import { auth, db } from '../services/firebase';
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
