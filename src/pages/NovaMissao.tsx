import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth, db } from '../services/firebase';
import { push, ref, set, update, get } from 'firebase/database';
import PageHeader from '../components/PageHeader';

type MissionTemplate = {
  titulo: string;
  referencias: string[];
  inicio: string;
  fim: string;
  repetir: boolean;
  diasSemana?: number[];
  overrides?: { data: string; disponivel: boolean }[];
  local?: string;
  tipo?: string;
};

export default function NovaMissao() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const unitCode = params.get('unit') || '';
  const editId = params.get('edit') || '';

  const [titulo, setTitulo] = useState('');
  const [referencias, setReferencias] = useState<string[]>([]);
  const [novaRef, setNovaRef] = useState('');
  const [inicio, setInicio] = useState('08:00');
  const [fim, setFim] = useState('12:00');
  const [repetir, setRepetir] = useState(true);
  const [diasSemana, setDiasSemana] = useState<number[]>([1,2,3,4,5]);
  const [overrides, setOverrides] = useState<{ data: string; disponivel: boolean }[]>([]);
  const [overrideData, setOverrideData] = useState('');
  const [overrideDisponivel, setOverrideDisponivel] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map((v) => parseInt(v, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
    return h * 60 + m;
  };
  const invalidTime = toMinutes(inicio) >= toMinutes(fim);

  useEffect(() => {
    if (!unitCode || !editId) return;
    (async () => {
      const snap = await get(ref(db, `/units/${unitCode}/missionTemplates/${editId}`));
      const val = snap.val() as MissionTemplate | null;
      if (!val) return;
      setTitulo(val.titulo || '');
      setReferencias(val.referencias || []);
      setInicio(val.inicio || '08:00');
      setFim(val.fim || '12:00');
      setRepetir(!!val.repetir);
      setDiasSemana(val.diasSemana || []);
      setOverrides(val.overrides || []);
    })();
  }, [unitCode, editId]);

  const addRef = () => {
    const r = novaRef.trim();
    if (!r) return;
    setReferencias((prev) => [...prev, r]);
    setNovaRef('');
  };

  const removeRef = (idx: number) => {
    setReferencias((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleDia = (dia: number) => {
    setDiasSemana((prev) => prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]);
  };

  const addOverride = () => {
    const d = overrideData.trim();
    if (!d) return;
    setOverrides((prev) => [...prev, { data: d, disponivel: overrideDisponivel }]);
    setOverrideData('');
    setOverrideDisponivel(true);
  };

  const removeOverride = (idx: number) => {
    setOverrides((prev) => prev.filter((_, i) => i !== idx));
  };

  const salvar = async () => {
    if (!unitCode) return;
    if (invalidTime) return; // impede salvar com horários inválidos
    setSaving(true);
    const payload: MissionTemplate = {
      titulo,
      referencias,
      inicio,
      fim,
      repetir,
      diasSemana: repetir ? diasSemana.sort() : [],
      overrides,
    };
    try {
      if (editId) {
        await update(ref(db, `/units/${unitCode}/missionTemplates/${editId}`), payload);
      } else {
        const idRef = push(ref(db, `/units/${unitCode}/missionTemplates`));
        await set(idRef, payload);
      }
      navigate(`/missao?unit=${unitCode}`);
    } catch (e) {
      // silencioso
    } finally {
      setSaving(false);
    }
  };

  const dias = [
    { label: 'Dom', value: 0 },
    { label: 'Seg', value: 1 },
    { label: 'Ter', value: 2 },
    { label: 'Qua', value: 3 },
    { label: 'Qui', value: 4 },
    { label: 'Sex', value: 5 },
    { label: 'Sáb', value: 6 },
  ];

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px]">
      <PageHeader title={editId ? 'Editar Missão' : 'Nova Missão'} />
      <div className="px-4 py-4 flex justify-center">
        <div className="bg-white border rounded-lg p-6 w-full max-w-2xl shadow-card">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-sm">Título</span>
              <input className="bg-white border rounded px-3 py-2" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </label>

            <div>
              <span className="text-secondary text-sm">Referências</span>
              <div className="mt-2">
                <div className="flex gap-2">
                  <input className="bg-white border rounded px-3 py-2 flex-1" placeholder="Adicionar referência" value={novaRef} onChange={(e) => setNovaRef(e.target.value)} />
                  <button className="px-3 py-2 bg-gray-200 rounded" onClick={addRef}>Adicionar</button>
                </div>
                <ul className="mt-2 divide-y">
                  {referencias.map((r, idx) => (
                    <li key={`${r}-${idx}`} className="py-2 flex items-center justify-between">
                      <span className="text-gray-text">{r}</span>
                      <button className="text-sm text-red-600 hover:underline" onClick={() => removeRef(idx)}>Remover</button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-secondary text-sm">Horário de início (24h)</span>
                <input type="time" lang="pt-BR" step={60} min="00:00" max="23:59" className="bg-white border rounded px-3 py-2" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-secondary text-sm">Horário de término (24h)</span>
                <input type="time" lang="pt-BR" step={60} min="00:00" max="23:59" className="bg-white border rounded px-3 py-2" value={fim} onChange={(e) => setFim(e.target.value)} />
              </label>
            </div>
            {invalidTime && (
              <p className="text-sm text-red-600">Horário inválido: o término deve ser após o início.</p>
            )}

            <div>
              <label className="flex flex-col gap-1">
                <span className="text-secondary text-sm">Recorrência</span>
                <select
                  className="bg-white border rounded px-3 py-2"
                  value={repetir ? 'semanal' : 'nao'}
                  onChange={(e) => setRepetir(e.target.value === 'semanal')}
                >
                  <option value="semanal">Repetir Semanalmente</option>
                  <option value="nao">Não se repete</option>
                </select>
              </label>
              {repetir && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {dias.map((d) => {
                    const selected = diasSemana.includes(d.value);
                    const cls = selected
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300';
                    return (
                      <label
                        key={d.value}
                        className={`inline-flex items-center justify-center w-10 h-10 rounded-full border text-sm font-medium cursor-pointer select-none transition-colors ${cls} hover:bg-blue-50 focus-within:ring-2 focus-within:ring-blue-500`}
                        aria-pressed={selected}
                        title={d.label}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={selected}
                          onChange={() => toggleDia(d.value)}
                        />
                        <span>{d.label}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <span className="text-secondary text-sm">Disponibilidade Ajustada</span>
              <div className="mt-2 flex items-center gap-2">
                <input type="date" className="bg-white border rounded px-3 py-2" value={overrideData} onChange={(e) => setOverrideData(e.target.value)} />
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={overrideDisponivel} onChange={(e) => setOverrideDisponivel(e.target.checked)} />
                  <span>Disponível</span>
                </label>
                <button className="px-3 py-2 bg-gray-200 rounded" onClick={addOverride}>Adicionar</button>
              </div>
              <ul className="mt-2 divide-y">
                {overrides.map((ov, idx) => (
                  <li
                    key={`${ov.data}-${idx}`}
                    className="py-2 text-sm text-gray-text flex items-center justify-between"
                  >
                    <span>
                      {ov.data} — {ov.disponivel ? 'Disponível' : 'Indisponível'}
                    </span>
                    <button
                      type="button"
                      className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                      title="Remover disponibilidade"
                      onClick={() => removeOverride(idx)}
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-end">
              <button className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark disabled:opacity-60" onClick={salvar} disabled={saving || !unitCode || !titulo.trim() || invalidTime}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}