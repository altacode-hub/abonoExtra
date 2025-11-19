import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { auth, db } from '../services/firebase';
import { get, ref, onValue, query, orderByChild, startAt, endAt } from 'firebase/database';

type UnitMeta = { titulo: string; descricao?: string };
type EscalaIndex = { titulo?: string; referencia?: string; local?: string; inicioTs?: number; fimTs?: number; efetivoCount?: number };

function monthKeyFromISO(iso: string) {
  return (iso || '').slice(0, 7);
}

function iterMonthKeysBetween(startIso: string, endIso: string): string[] {
  const [ys, ms] = startIso.split('-').map((v) => parseInt(v, 10));
  const [ye, me] = endIso.split('-').map((v) => parseInt(v, 10));
  if (Number.isNaN(ys) || Number.isNaN(ms) || Number.isNaN(ye) || Number.isNaN(me)) return [];
  const out: string[] = [];
  let y = ys;
  let m = ms;
  while (y < ye || (y === ye && m <= me)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function tsOfISO(iso: string, time: 'start' | 'end' = 'start') {
  const [yy, mm, dd] = iso.split('-').map((v) => parseInt(v, 10));
  if (Number.isNaN(yy) || Number.isNaN(mm) || Number.isNaN(dd)) return 0;
  const d = new Date(yy, mm - 1, dd, time === 'start' ? 0 : 23, time === 'start' ? 0 : 59, time === 'start' ? 0 : 59);
  return d.getTime();
}

export default function Relatorio() {
  const [adminUnits, setAdminUnits] = useState<Record<string, UnitMeta>>({});
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [startIso, setStartIso] = useState<string>(() => toISODate(new Date()));
  const [endIso, setEndIso] = useState<string>(() => toISODate(new Date()));
  const [results, setResults] = useState<Array<{ month: string; escalaId: string; data: EscalaIndex }>>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Carrega unidades administradas pelo usuário (como em Escala)
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const r = ref(db, `/roles/${uid}/unitAdmin`);
    const unsub = onValue(r, (snap) => {
      const unitsMap: Record<string, boolean> = snap.val() || {};
      const codes = Object.keys(unitsMap);
      if (codes.length === 0) {
        setAdminUnits({});
        setSelectedUnit('');
        return;
      }
      const updates: Record<string, UnitMeta> = {};
      let pending = codes.length;
      codes.forEach((code) => {
        const rMeta = ref(db, `/units/${code}/meta/titulo`);
        get(rMeta)
          .then((metaSnap) => {
            const titulo = metaSnap.val() || code;
            updates[code] = { titulo };
          })
          .catch(() => {
            updates[code] = { titulo: code };
          })
          .finally(() => {
            pending -= 1;
            if (pending === 0) {
              setAdminUnits(updates);
              if (!selectedUnit) setSelectedUnit(codes[0]);
            }
          });
      });
    });
    return () => unsub();
  }, [selectedUnit]);

  const unitOptions = useMemo(() => Object.entries(adminUnits), [adminUnits]);

  // Busca por período, consultando por mês com filtros em inicioTs
  const runQuery = async () => {
    if (!selectedUnit || !startIso || !endIso) return;
    setLoading(true);
    setError('');
    try {
      const months = iterMonthKeysBetween(monthKeyFromISO(startIso), monthKeyFromISO(endIso));
      const startTs = tsOfISO(startIso, 'start');
      const endTs = tsOfISO(endIso, 'end');
      const acc: Array<{ month: string; escalaId: string; data: EscalaIndex }> = [];
      for (const m of months) {
        const base = ref(db, `/units/${selectedUnit}/escalasIndex/${m}`);
        // Limitar por faixa de timestamps dentro do mês
        const q = query(base, orderByChild('inicioTs'), startAt(startTs), endAt(endTs));
        const snap = await get(q);
        const val = snap.val() || {};
        Object.entries(val).forEach(([escalaId, data]) => {
          const d = data as EscalaIndex;
          if (!d?.inicioTs) return;
          if (d.inicioTs >= startTs && d.inicioTs <= endTs) {
            acc.push({ month: m, escalaId, data: d });
          }
        });
      }
      acc.sort((a, b) => (b.data.inicioTs || 0) - (a.data.inicioTs || 0));
      setResults(acc);
    } catch (e: any) {
      setError('Falha ao carregar dados do período.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnit]);

  const onChangeStart = (e: React.ChangeEvent<HTMLInputElement>) => setStartIso(e.target.value);
  const onChangeEnd = (e: React.ChangeEvent<HTMLInputElement>) => setEndIso(e.target.value);

  useEffect(() => {
    const s = tsOfISO(startIso, 'start');
    const e = tsOfISO(endIso, 'end');
    if (s && e && s <= e) {
      runQuery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startIso, endIso]);

  const exportCSV = () => {
    const rows = [
      ['Data', 'Título', 'Referência', 'Local', 'Início', 'Fim', 'Efetivo'],
      ...results.map((r) => [
        new Date(r.data.inicioTs || 0).toLocaleDateString('pt-BR'),
        r.data.titulo || 'Missão',
        r.data.referencia || '',
        r.data.local || '',
        new Date(r.data.inicioTs || 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        new Date(r.data.fimTs || 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        String(r.data.efetivoCount || 0),
      ]),
    ];
    const csv = rows.map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${selectedUnit}_${startIso}_a_${endIso}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px] pb-6">
      <PageHeader title="Relatório" />
      <div className="px-4 py-4 space-y-4">
        <section className="bg-white border rounded-lg p-4 shadow-card">
          <h2 className="text-lg font-semibold text-gray-text mb-3">Período</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col">
              <label className="text-xs text-gray-light" htmlFor="unit">Unidade</label>
              <select id="unit" className="border rounded px-2 py-1 text-sm" value={selectedUnit} onChange={(e) => setSelectedUnit(e.target.value)}>
                {unitOptions.map(([code, meta]) => (
                  <option key={code} value={code}>{meta.titulo || code}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-light" htmlFor="start">Início</label>
              <input
                id="start"
                type="date"
                lang="pt-BR"
                className="border rounded px-2 py-1 text-sm"
                value={startIso}
                onChange={onChangeStart}
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs text-gray-light" htmlFor="end">Fim</label>
              <input
                id="end"
                type="date"
                lang="pt-BR"
                className="border rounded px-2 py-1 text-sm"
                value={endIso}
                onChange={onChangeEnd}
              />
            </div>
            <div className="flex-1" />
            <button className="border rounded px-3 py-2 text-sm hover:bg-gray-50" onClick={exportCSV} disabled={results.length === 0}>Exportar CSV</button>
          </div>
          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
        </section>

        <section className="bg-white border rounded-lg p-4 shadow-card">
          <h2 className="text-lg font-semibold text-gray-text mb-3">Resultados</h2>
          {loading ? (
            <div className="text-sm text-gray-light">Carregando...</div>
          ) : results.length === 0 ? (
            <div className="text-sm text-gray-light">Nenhum registro no período selecionado.</div>
          ) : (
            <ul className="divide-y">
              {results.map(({ month, escalaId, data }) => (
                <li key={`${month}/${escalaId}`} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-light">{new Date(data.inicioTs || 0).toLocaleDateString('pt-BR')}</div>
                    <div className="text-gray-text font-semibold">{data.titulo || 'Missão'}</div>
                    <div className="text-sm text-gray-text">{data.referencia || data.local || ''}</div>
                    <div className="text-xs text-gray-light">{new Date(data.inicioTs || 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} - {new Date(data.fimTs || 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <div className="text-sm text-gray-text">Efetivo: {data.efetivoCount || 0}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}