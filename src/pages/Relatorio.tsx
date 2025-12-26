import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { auth, db } from '../services/firebase';
import { get, ref, onValue } from 'firebase/database';

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
  const navigate = useNavigate();
  const [adminUnits, setAdminUnits] = useState<Record<string, UnitMeta>>({});
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [startIso, setStartIso] = useState<string>(() => toISODate(new Date()));
  const [endIso, setEndIso] = useState<string>(() => toISODate(new Date()));
  const [results, setResults] = useState<Array<{ month: string; escalaId: string; data: EscalaIndex }>>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [efetivosAgg, setEfetivosAgg] = useState<Record<string, { nome: string; count: number }>>({});

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
        const snap = await get(base);
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

  // Agrega efetivos escalados no período a partir dos resultados
  useEffect(() => {
    (async () => {
      if (!selectedUnit || results.length === 0) {
        setEfetivosAgg({});
        return;
      }
      const next: Record<string, { nome: string; count: number }> = {};
      const promises = results.map(async ({ month, escalaId }) => {
        try {
          const snap = await get(ref(db, `/units/${selectedUnit}/escalas/${month}/${escalaId}/efetivo`));
          const efetivo = snap.val() || {};
          Object.entries(efetivo).forEach(([uid, entry]: any) => {
            const nome = entry?.ng || uid;
            if (!next[uid]) next[uid] = { nome, count: 0 };
            next[uid].count += 1;
          });
        } catch {}
      });
      await Promise.all(promises);
      setEfetivosAgg(next);
    })();
  }, [results, selectedUnit]);

  

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
          </div>
          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
        </section>


        <section className="bg-white border rounded-lg p-4 shadow-card">
          <h2 className="text-lg font-semibold text-gray-text mb-3">Efetivos no período</h2>
          {Object.keys(efetivosAgg).length === 0 ? (
            <div className="text-sm text-gray-light">Nenhum efetivo escalado no período.</div>
          ) : (
            <ul className="divide-y">
              {Object.entries(efetivosAgg)
                .sort(([, a], [, b]) => new Intl.Collator('pt-BR', { sensitivity: 'base' }).compare(a.nome || '', b.nome || ''))
                .map(([uid, info]) => (
                <li
                  key={uid}
                  className="py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                  title="Visualizar detalhes do efetivo"
                  onClick={() => navigate(`/relatorio/efetivo/${uid}?unit=${selectedUnit}&start=${startIso}&end=${endIso}`)}
                >
                  <div>
                    <div className="font-medium">{info.nome}</div>
                    <div className="text-sm text-gray-light">Escalado no período: {info.count}</div>
                  </div>
                  <span className="text-xs text-gray-500">detalhes</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
