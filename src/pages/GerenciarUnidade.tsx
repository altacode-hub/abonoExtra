import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { onValue, ref, update } from 'firebase/database';
import PageHeader from '../components/PageHeader';
import { db } from '../services/firebase';
import UnitMembersSection from '../components/Unidade/UnitMembersSection';

type UnitMeta = { titulo: string; descricao?: string; cidade?: string };

export default function GerenciarUnidade() {
  const { code } = useParams<{ code: string}>();
  const [meta, setMeta] = useState<UnitMeta | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!code) return;
    const r = ref(db, `/units/${code}/meta`);
    const unsub = onValue(r, (snap) => setMeta(snap.val() || null));
    return () => unsub();
  }, [code]);

  const saveMeta = async () => {
    if (!code || !meta) return;
    setSaving(true);
    try {
      await update(ref(db, `/units/${code}/meta`), {
        titulo: meta.titulo || '',
        descricao: meta.descricao || '',
        cidade: meta.cidade || '',
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px] pb-6">
      <PageHeader title={`Gerenciar Unidade${meta?.titulo ? ` — ${meta.titulo}` : ''}`} />
      <div className="px-4 py-4 grid grid-cols-1 gap-4">
        <section className="bg-white border rounded-lg p-6 shadow-card">
          <h2 className="text-lg font-semibold text-gray-text mb-2">Dados da Unidade</h2>
          {!editing ? (
            <div className="space-y-2 text-gray-text">
              <div><span className="text-secondary">Código:</span> {code}</div>
              <div><span className="text-secondary">Título:</span> {meta?.titulo || '-'}</div>
              <div><span className="text-secondary">Descrição:</span> {meta?.descricao || '-'}</div>
              <div><span className="text-secondary">Cidade:</span> {meta?.cidade || '-'}</div>
              <div className="flex justify-end mt-4">
                <button
                  className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
                  onClick={() => setEditing(true)}
                >
                  Editar dados
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="flex flex-col gap-1">
                <span className="text-secondary text-sm">Título</span>
                <input
                  className="bg-white border rounded px-3 py-2"
                  value={meta?.titulo || ''}
                  onChange={(e) => setMeta({ ...(meta || { titulo: '' }), titulo: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-secondary text-sm">Descrição</span>
                <input
                  className="bg-white border rounded px-3 py-2"
                  value={meta?.descricao || ''}
                  onChange={(e) => setMeta({ ...(meta || { titulo: '' }), descricao: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-secondary text-sm">Cidade</span>
                <input
                  className="bg-white border rounded px-3 py-2"
                  value={meta?.cidade || ''}
                  onChange={(e) => setMeta({ ...(meta || { titulo: '' }), cidade: e.target.value })}
                />
              </label>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-60"
                  onClick={saveMeta}
                  disabled={saving}
                >
                  {saving ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          )}
        </section>
        {code && <UnitMembersSection unitCode={code} />}
      </div>
    </div>
  );
}