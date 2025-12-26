import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { db } from '../services/firebase';
import { get, ref } from 'firebase/database';

function monthKeyFromISO(iso: string) {
  return (iso || '').slice(0, 7);
}

function iterMonthKeysBetween(startIso: string, endIso: string): string[] {
  const [ys, ms] = (startIso || '').split('-').map((v) => parseInt(v, 10));
  const [ye, me] = (endIso || '').split('-').map((v) => parseInt(v, 10));
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

function tsOfISO(iso: string, time: 'start' | 'end' = 'start') {
  const [yy, mm, dd] = (iso || '').split('-').map((v) => parseInt(v, 10));
  if (Number.isNaN(yy) || Number.isNaN(mm) || Number.isNaN(dd)) return 0;
  const d = new Date(yy, mm - 1, dd, time === 'start' ? 0 : 23, time === 'start' ? 0 : 59, time === 'start' ? 0 : 59);
  return d.getTime();
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function iterDaysBetween(startIso: string, endIso: string): string[] {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const out: string[] = [];
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(toISODate(d));
  }
  return out;
}

export default function RelatorioEfetivo() {
  const { uid } = useParams();
  const [params] = useSearchParams();
  const unit = params.get('unit') || '';
  const startIso = params.get('start') || toISODate(new Date());
  const endIso = params.get('end') || toISODate(new Date());

  const [nome, setNome] = useState<string>('');
  const [unitMeta, setUnitMeta] = useState<{ titulo?: string; descricao?: string } | null>(null);
  const [escaladoDias, setEscaladoDias] = useState<string[]>([]);
  const [voluntarioDias, setVoluntarioDias] = useState<string[]>([]);

  const escaladoCount = escaladoDias.length;
  const voluntarioCount = voluntarioDias.length + escaladoDias.length;
  const percentual = useMemo(() => {
    if (voluntarioCount === 0) return 0;
    const p = (escaladoCount / voluntarioCount) * 100;
    return Math.round(p * 100) / 100;
  }, [escaladoCount, voluntarioCount]);

  useEffect(() => {
    (async () => {
      if (!uid || !unit || !startIso || !endIso) {
        setEscaladoDias([]);
        return;
      }
      const months = iterMonthKeysBetween(monthKeyFromISO(startIso), monthKeyFromISO(endIso));
      const sTs = tsOfISO(startIso, 'start');
      const eTs = tsOfISO(endIso, 'end');
      const days: string[] = [];
      for (const m of months) {
        try {
          const snap = await get(ref(db, `/userEscalas/${uid}/${m}`));
          const val = snap.val() || {};
          Object.values(val).forEach((entry: any) => {
            if ((entry?.unitId || '') !== unit) return;
            const it = entry?.inicioTs || 0;
            if (it >= sTs && it <= eTs) {
              const d = new Date(it);
              days.push(toISODate(d));
              if (!nome) setNome(entry?.ng || '');
            }
          });
        } catch {}
      }
      // Remover duplicados
      const uniq = Array.from(new Set(days));
      setEscaladoDias(uniq.sort());
    })();
  }, [uid, unit, startIso, endIso, nome]);

  useEffect(() => {
    (async () => {
      if (!uid) return;
      try {
        const snap = await get(ref(db, `/users/${uid}/profile`));
        const val = snap.val() || {};
        const ng = val?.nomeGuerra || val?.nomeCompleto || '';
        if (ng) setNome(ng);
      } catch {}
    })();
  }, [uid]);

  useEffect(() => {
    (async () => {
      if (!unit) return;
      try {
        const snap = await get(ref(db, `/units/${unit}/meta`));
        const val = snap.val() || {};
        setUnitMeta({ titulo: val?.titulo, descricao: val?.descricao });
      } catch {
        setUnitMeta(null);
      }
    })();
  }, [unit]);

  useEffect(() => {
    (async () => {
      if (!uid || !unit || !startIso || !endIso) {
        setVoluntarioDias([]);
        return;
      }
      const days = iterDaysBetween(startIso, endIso);
      const out: string[] = [];
      const promises = days.map(async (d) => {
        try {
          const snap = await get(ref(db, `/units/${unit}/inscricoes/${d}`));
          const missions = snap.val() || {};
          const found = Object.values(missions).some((vols: any) => {
            const u = vols?.[uid];
            const st = u?.status || '';
            return st === 'voluntario';
          });
          if (found) out.push(d);
        } catch {}
      });
      await Promise.all(promises);
      setVoluntarioDias(out.sort());
    })();
  }, [uid, unit, startIso, endIso]);

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px] pb-6">
      <PageHeader title="Relatório do Efetivo" />
      <div className="px-4 py-4 space-y-4">
        <section className="bg-white border rounded-lg p-4 shadow-card">
          <h2 className="text-lg font-semibold text-gray-text mb-2">Efetivo</h2>
          <div className="text-sm text-gray-text">{nome || uid}</div>
          <div className="text-xs text-gray-light">Unidade: {unitMeta?.descricao || unitMeta?.titulo || unit}</div>
          <div className="text-xs text-gray-light">Período: {startIso} a {endIso}</div>
        </section>

        <section className="bg-white border rounded-lg p-4 shadow-card">
          <h2 className="text-lg font-semibold text-gray-text mb-3">Resumo</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border rounded-lg p-3">
              <div className="text-sm text-gray-light">Dias escalado</div>
              <div className="text-2xl font-semibold">{escaladoCount}</div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="text-sm text-gray-light">Dias voluntário</div>
              <div className="text-2xl font-semibold">{voluntarioCount}</div>
            </div>
            <div className="border rounded-lg p-3">
              <div className="text-sm text-gray-light">% escalado / voluntário</div>
              <div className="text-2xl font-semibold">{percentual}%</div>
            </div>
          </div>
        </section>

        <section className="bg-white border rounded-lg p-4 shadow-card">
          <h2 className="text-lg font-semibold text-gray-text mb-3">Dias escalado</h2>
          {escaladoDias.length === 0 ? (
            <div className="text-sm text-gray-light">Nenhum dia escalado no período.</div>
          ) : (
            <ul className="divide-y">
              {escaladoDias.map((d) => (
                <li key={`e-${d}`} className="py-3 flex items-center justify-between">
                  <div className="font-medium">{d}</div>
                  <span className="text-xs text-gray-500">escalado</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white border rounded-lg p-4 shadow-card">
          <h2 className="text-lg font-semibold text-gray-text mb-3">Dias não escalado / voluntário</h2>
          {voluntarioDias.length === 0 ? (
            <div className="text-sm text-gray-light">Nenhum dia como voluntário no período.</div>
          ) : (
            <ul className="divide-y">
              {voluntarioDias.map((d) => (
                <li key={`v-${d}`} className="py-3 flex items-center justify-between">
                  <div className="font-medium">{d}</div>
                  <span className="text-xs text-gray-500">voluntário</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
