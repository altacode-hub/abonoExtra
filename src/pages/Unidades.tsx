import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { addUnitToUserFromCode, removeUnitFromUserByCode } from '../services/rbac';
import { auth, db } from '../services/firebase';
import { onValue, ref } from 'firebase/database';

export default function Unidades() {
  const [unitCode, setUnitCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [userUnits, setUserUnits] = useState<Record<string, { titulo: string; descricao?: string; cidade?: string }>>({});

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const r = ref(db, `/users/${uid}/units`);
    const unsub = onValue(r, (snap) => {
      const val = snap.val() || {};
      setUserUnits(val);
    });
    return () => unsub();
  }, []);

  const register = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const code = unitCode.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) {
        throw new Error('Código deve ter 6 caracteres (A-Z, 0-9)');
      }
      await addUnitToUserFromCode(code);
      setMessage('Unidade adicionada à sua lista');
      setUnitCode('');
    } catch (e: any) {
      setMessage(e?.message || 'Falha ao cadastrar unidade');
    } finally {
      setSaving(false);
    }
  };

  const removeUnit = async (code: string) => {
    setSaving(true);
    setMessage(null);
    try {
      await removeUnitFromUserByCode(code);
      setMessage('Unidade removida da sua lista');
    } catch (e: any) {
      setMessage(e?.message || 'Falha ao remover unidade');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px] pb-20">
      <PageHeader title="Unidades" />
      <div className="px-4 py-4">
        <div className="bg-white border rounded-lg p-4">
          <ul className="divide-y">
            {Object.entries(userUnits).length === 0 && (
              <li className="py-2 text-gray-light">Nenhuma unidade cadastrada</li>
            )}
            {Object.entries(userUnits).map(([code, meta]) => (
              <li key={code} className="py-2 text-gray-text flex items-center justify-between">
                <div>
                  <div className="font-medium">{meta.titulo}</div>
                  <div className="text-sm text-gray-light">{meta.cidade}</div>
                </div>
                <button
                  className="p-2 text-red-600 hover:bg-surface-gray rounded"
                  onClick={() => removeUnit(code)}
                  aria-label={`Excluir unidade ${meta.titulo}`}
                  title="Excluir"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M6 6l1 14h10l1-14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {/* Rodapé com input e botão de adicionar (seta para cima) */}
      <div className="fixed bottom-0 inset-x-0 z-50 bg-white border-t">
        <div className="px-4 py-3 flex items-center gap-2">
          <input
            className="flex-1 bg-white border rounded px-3 py-2"
            placeholder="código da unidade"
            value={unitCode}
            onChange={(e) => setUnitCode(e.target.value)}
          />
          <button
            className="px-3 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-60"
            onClick={register}
            disabled={saving || !unitCode.trim()}
            aria-label="Adicionar unidade"
            title="Adicionar unidade"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}