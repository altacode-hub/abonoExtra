import { useEffect, useState } from 'react';
import { onValue, ref, update } from 'firebase/database';
import PageHeader from '../components/PageHeader';
import MinhasUnidadesSection from '../components/Configuracao/MinhasUnidadesSection';
import CabecalhoMissoesSection from '../components/Configuracao/CabecalhoMissoesSection';
import CabecalhoPlanilhasSection from '../components/Configuracao/CabecalhoPlanilhasSection';
import CabecalhoRelatoriosSection from '../components/Configuracao/CabecalhoRelatoriosSection';
import { auth, db } from '../services/firebase';
import { useNavigate } from 'react-router-dom';

type UnitMeta = { titulo: string; descricao?: string; cidade?: string };
type HeadersSettings = {
  missoes?: { titulo?: string };
  planilhas?: { titulo?: string };
  relatorios?: { titulo?: string };
};

export default function Configuracao() {
  const navigate = useNavigate();
  const [userUnits, setUserUnits] = useState<Record<string, UnitMeta>>({});
  const [headers, setHeaders] = useState<HeadersSettings>({});
  const [saving, setSaving] = useState(false);
  const [funcUnit, setFuncUnit] = useState<string>('');
  const [funcList, setFuncList] = useState<Record<string, string>>({});
  const [newFunc, setNewFunc] = useState('');

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    // Carrega unidades vinculadas ao usuário
    const rUnits = ref(db, `/users/${uid}/units`);
    const unsubUnits = onValue(rUnits, (snap) => setUserUnits(snap.val() || {}));
    // Carrega configurações de cabeçalhos
    const rHeaders = ref(db, `/users/${uid}/settings/headers`);
    const unsubHeaders = onValue(rHeaders, (snap) => setHeaders(snap.val() || {}));
    return () => {
      unsubUnits();
      unsubHeaders();
    };
  }, []);

  // Seleciona unidade padrão para Funções quando unidades carregarem
  useEffect(() => {
    const codes = Object.keys(userUnits || {});
    if (!funcUnit && codes.length > 0) {
      setFuncUnit(codes[0]);
    }
  }, [userUnits, funcUnit]);

  // Carrega lista de funções por unidade selecionada
  useEffect(() => {
    if (!funcUnit) {
      setFuncList({});
      return;
    }
    const r = ref(db, `/units/${funcUnit}/settings/funcoes`);
    const unsub = onValue(r, (snap) => setFuncList(snap.val() || {}));
    return () => unsub();
  }, [funcUnit]);

  const saveMissoesHeader = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    try {
      await update(ref(db, `/users/${uid}/settings/headers/missoes`), {
        titulo: headers.missoes?.titulo || '',
      });
    } finally {
      setSaving(false);
    }
  };

  const savePlanilhasHeader = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    try {
      await update(ref(db, `/users/${uid}/settings/headers/planilhas`), {
        titulo: headers.planilhas?.titulo || '',
      });
    } finally {
      setSaving(false);
    }
  };

  const saveRelatoriosHeader = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    try {
      await update(ref(db, `/users/${uid}/settings/headers/relatorios`), {
        titulo: headers.relatorios?.titulo || '',
      });
    } finally {
      setSaving(false);
    }
  };

  const goEditUnit = (unitCode: string) => {
    // Navega para a tela de gerenciamento da unidade específica
    navigate(`/unidade/${unitCode}`);
  };

  const slugify = (s: string) => (s || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  const addFuncao = async () => {
    if (!funcUnit || !newFunc.trim()) return;
    const key = slugify(newFunc);
    setSaving(true);
    try {
      await update(ref(db, `/units/${funcUnit}/settings/funcoes`), { [key]: newFunc.trim() });
      setNewFunc('');
    } finally {
      setSaving(false);
    }
  };

  const removeFuncao = async (key: string) => {
    if (!funcUnit || !key) return;
    setSaving(true);
    try {
      await update(ref(db, `/units/${funcUnit}/settings/funcoes`), { [key]: null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px] pb-6">
      <PageHeader title="Configuração" />
      <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Seção de Unidades administradas/membros */}
        <MinhasUnidadesSection
          userUnits={userUnits}
          onManageUnit={goEditUnit}
          onCreateNewUnit={() => navigate('/unidades/nova')}
        />

        {/* Seção de Cabeçalho — Missões */}
        <CabecalhoMissoesSection
          value={headers.missoes?.titulo || ''}
          onChange={(v) => setHeaders({ ...headers, missoes: { titulo: v } })}
          onSave={saveMissoesHeader}
          saving={saving}
        />

        {/* Seção de Cabeçalho — Planilhas */}
        <CabecalhoPlanilhasSection
          value={headers.planilhas?.titulo || ''}
          onChange={(v) => setHeaders({ ...headers, planilhas: { titulo: v } })}
          onSave={savePlanilhasHeader}
          saving={saving}
        />

        {/* Seção de Cabeçalho — Relatórios */}
        <CabecalhoRelatoriosSection
          value={headers.relatorios?.titulo || ''}
          onChange={(v) => setHeaders({ ...headers, relatorios: { titulo: v } })}
          onSave={saveRelatoriosHeader}
          saving={saving}
        />

        {/* Seção — Funções do Efetivo */}
        <section className="bg-white border rounded-lg p-4 shadow-card">
          <h2 className="text-lg font-semibold text-gray-text mb-2">Funções do Efetivo</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-light">Unidade</span>
              <select
                className="bg-white border rounded px-3 py-2"
                value={funcUnit}
                onChange={(e) => setFuncUnit(e.target.value)}
              >
                {Object.keys(userUnits).map((code) => (
                  <option key={code} value={code}>{userUnits[code]?.titulo || code}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-light">Nova função</span>
              <div className="flex gap-2">
                <input
                  className="border rounded px-3 py-2 flex-1"
                  value={newFunc}
                  onChange={(e) => setNewFunc(e.target.value)}
                  placeholder="Ex.: Comandante, Motorista"
                />
                <button className="px-3 py-2 bg-primary text-white rounded disabled:opacity-60" onClick={addFuncao} disabled={saving || !newFunc.trim()}>Adicionar</button>
              </div>
            </label>
          </div>
          <div>
            <ul className="divide-y rounded border">
              {Object.entries(funcList).length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-light">Nenhuma função cadastrada.</li>
              ) : (
                Object.entries(funcList).map(([key, label]) => (
                  <li key={key} className="px-3 py-2 flex items-center justify-between">
                    <span className="text-sm">{label}</span>
                    <button className="px-2 py-1 border rounded text-xs" onClick={() => removeFuncao(key)} disabled={saving}>Remover</button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}