import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { onValue, ref, update, set, remove } from 'firebase/database';
import PageHeader from '../components/PageHeader';
import { db } from '../services/firebase';
import UnitMembersSection from '../components/Unidade/UnitMembersSection';

type UnitMeta = { titulo: string; descricao?: string; cidade?: string };

export default function GerenciarUnidade() {
  const { code } = useParams<{ code: string}>();
  const [meta, setMeta] = useState<UnitMeta | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quotas, setQuotas] = useState<Record<string, number>>({});
  const [newMonthKey, setNewMonthKey] = useState<string>('');
  const [newQuota, setNewQuota] = useState<number>(0);

  useEffect(() => {
    if (!code) return;
    const r = ref(db, `/units/${code}/meta`);
    const unsub = onValue(r, (snap) => setMeta(snap.val() || null));
    return () => unsub();
  }, [code]);

  useEffect(() => {
    if (!code) return;
    const rq = ref(db, `/units/${code}/settings/extrasQuota`);
    const unsub = onValue(rq, (snap) => {
      const val = snap.val() || {};
      setQuotas(val);
    });
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

  const addOrUpdateQuota = async () => {
    if (!code) return;
    const mk = (newMonthKey || '').slice(0, 7);
    if (!mk || mk.length !== 7) return;
    const qty = Number.isFinite(newQuota) ? Math.max(0, Math.floor(newQuota)) : 0;
    await set(ref(db, `/units/${code}/settings/extrasQuota/${mk}`), qty);
    setNewQuota(0);
  };

  const deleteQuota = async (mk: string) => {
    if (!code || !mk) return;
    await remove(ref(db, `/units/${code}/settings/extrasQuota/${mk}`));
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
        <section className="bg-white border rounded-lg p-6 shadow-card">
          <h2 className="text-lg font-semibold text-gray-text mb-2">Cotas de Extras (por mês)</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-sm">Mês/Ano</span>
              <input
                type="month"
                className="bg-white border rounded px-3 py-2"
                value={newMonthKey}
                onChange={(e) => setNewMonthKey(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-sm">Quantidade de extras</span>
              <input
                type="number"
                min={0}
                className="bg-white border rounded px-3 py-2"
                value={Number.isFinite(newQuota) ? newQuota : 0}
                onChange={(e) => setNewQuota(parseInt(e.target.value || '0', 10))}
              />
            </label>
            <div className="flex md:justify-end">
              <button
                className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
                onClick={addOrUpdateQuota}
                disabled={!newMonthKey}
              >
                Adicionar/Atualizar
              </button>
            </div>
          </div>
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-text mb-2">Cotas configuradas</h3>
            <div className="divide-y">
              {Object.keys(quotas || {}).length === 0 && (
                <div className="py-2 text-gray-500">Nenhuma cota definida.</div>
              )}
              {Object.entries(quotas || {})
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([mk, qty]) => (
                  <div key={mk} className="flex items-center justify-between py-2">
                    <div className="text-gray-text">
                      <span className="text-secondary">{mk}</span> — {qty} extras
                    </div>
                    <button
                      className="p-2 rounded hover:bg-gray-100 text-gray-500 hover:text-red-600"
                      onClick={() => deleteQuota(mk)}
                      aria-label="Excluir cota"
                      title="Excluir cota"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                        <path d="M6 7h12" strokeWidth="1.5" strokeLinecap="round" />
                        <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" strokeWidth="1.5" strokeLinecap="round" />
                        <path d="M19 7l-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10 11v6M14 11v6" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
