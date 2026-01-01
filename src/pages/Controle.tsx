import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { auth, db } from '../services/firebase';
import { get, onValue, ref } from 'firebase/database';
//componentes
import { UserProfiles } from '../components/UserProfiles';
import TopContribuintes from '../components/Controle/TopContribuintes';

type UnitOption = { code: string; titulo: string };

export default function Controle() {
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [selectedUnit, setSelectedUnit] = useState('');
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const [monthlyQuota, setMonthlyQuota] = useState<number>(0);
  const [totalEfetivoMes, setTotalEfetivoMes] = useState<number>(0);
  const [membersCount, setMembersCount] = useState<number>(0);
  const [servedCount, setServedCount] = useState<number>(0);
  const [dailyCounts, setDailyCounts] = useState<Record<string, number>>({});

  const initialMonthKey = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, []);
  const [monthKey, setMonthKey] = useState(initialMonthKey);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const adminRef = ref(db, `/roles/${uid}/unitAdmin`);
    let cancelled = false;
    onValue(adminRef, async (snap) => {
      const val = snap.val() || {};
      const codes = Object.keys(val);
      const opts: UnitOption[] = [];
      for (const code of codes) {
        const metaSnap = await get(ref(db, `/units/${code}/meta/titulo`));
        const titulo = metaSnap.exists() ? (metaSnap.val() as string) : code;
        opts.push({ code, titulo });
      }
      if (cancelled) return;
      setUnitOptions(opts);
      if (!selectedUnit) {
        const currentSnap = await get(ref(db, `/roles/${uid}/unitAtual`));
        const currentUnit = currentSnap.exists() ? (currentSnap.val() as string) : (opts[0]?.code || '');
        setSelectedUnit(currentUnit || '');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedUnit]);

  const [memberUids, setMemberUids] = useState<string[]>([]);
  useEffect(() => {
    if (!selectedUnit) return;
    const quotaRef = ref(db, `/units/${selectedUnit}/settings/extrasQuota/${monthKey}`);
    const unsubQuota = onValue(quotaRef, (snap) => {
      const val = snap.val();
      setMonthlyQuota(Number.isFinite(val) ? Number(val) : 0);
    });
    const membersRef = ref(db, `/units/${selectedUnit}/members`);
    const unsubMembers = onValue(membersRef, (snap) => {
      const obj = snap.val() || {};
      const uids = Object.keys(obj);
      setMembersCount(uids.length);
      setMemberUids(uids);
    });
    return () => {
      unsubQuota();
      unsubMembers();
    };
  }, [selectedUnit, monthKey]);

  useEffect(() => {
    (async () => {
      if (!selectedUnit || memberUids.length === 0) {
        setTotalEfetivoMes(0);
        setServedCount(0);
        setDailyCounts({});
        return;
      }
      const countsByUid: Record<string, number> = {};
      const daily: Record<string, number> = {};
      const names: Record<string, string> = {};
      for (const uid of memberUids) {
        try {
          const snap = await get(ref(db, `/userEscalas/${uid}/${monthKey}`));
          const val = snap.val() || {};
          let cnt = 0;
          Object.values(val).forEach((entry: any) => {
            if ((entry?.unitId || '') !== selectedUnit) return;
            cnt += 1;
            const ts = Number(entry?.inicioTs || entry?.fimTs || 0);
            if (ts) {
              const dt = new Date(ts);
              const y = dt.getFullYear();
              const m = String(dt.getMonth() + 1).padStart(2, '0');
              const dd = String(dt.getDate()).padStart(2, '0');
              const key = `${y}-${m}-${dd}`;
              daily[key] = (daily[key] || 0) + 1;
            }
          });
          countsByUid[uid] = cnt;
          if (cnt > 0) {
            try {
              const pSnap = await get(ref(db, `/users/${uid}/profile`));
              const p = pSnap.val() || {};
              names[uid] = p?.nomeCompleto || p?.nomeGuerra || uid;
            } catch {
              names[uid] = uid;
            }
          }
        } catch {
          countsByUid[uid] = 0;
        }
      }
      const served = Object.values(countsByUid).filter((v) => v > 0).length;
      const total = Object.values(countsByUid).reduce((sum, v) => sum + v, 0);
      const counts: Record<string, { name: string; count: number }> = {};
      Object.entries(countsByUid).forEach(([uid, v]) => {
        if (v > 0) counts[uid] = { name: names[uid] || uid, count: v };
      });
      setServedCount(served);
      setTotalEfetivoMes(total);
      setDailyCounts(daily);
    })();
  }, [selectedUnit, monthKey, memberUids]);

  const notServedCount = Math.max(0, membersCount - servedCount);
  const quotaProgress = monthlyQuota > 0 ? Math.min(100, Math.round((totalEfetivoMes / monthlyQuota) * 100)) : 0;
  

  const daysInMonth = useMemo(() => {
    const [yStr, mStr] = monthKey.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return 30;
    return new Date(y, m, 0).getDate();
  }, [monthKey]);

  const dailySeries = useMemo(() => {
    const series: number[] = [];
    const [yStr, mStr] = monthKey.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    for (let d = 1; d <= daysInMonth; d++) {
      const dd = String(d).padStart(2, '0');
      const key = `${y}-${String(m).padStart(2, '0')}-${dd}`;
      series.push(dailyCounts[key] || 0);
    }
    return series;
  }, [dailyCounts, daysInMonth, monthKey]);

  function BarChart({ values, height = 220, color = '#0EA5E9' }: { values: number[]; labels: string[]; height?: number; color?: string }) {
    const w = 640;
    const h = height;
    const padding = 28;
    const n = values.length || 0;
    const max = values.reduce((m, v) => (v > m ? v : m), 0);
    const innerH = h - padding * 2;
    const innerW = w - padding * 2;
    const step = n > 0 ? innerW / n : innerW;
    const barW = step * 0.7;
    const toY = (v: number) => (max > 0 ? h - padding - (v / max) * innerH : h - padding);
    const toX = (i: number) => padding + i * step + step / 2;
    const xTicks = [1, 8, 15, 22, daysInMonth].filter((d, i, arr) => arr.indexOf(d) === i);
    const gridY = 4;
    return (
      <div className="mt-4">
        <svg width="100%" viewBox={`0 0 ${w} ${h}`} aria-label="Gráfico em colunas">
          <rect x={padding} y={padding} width={innerW} height={innerH} fill="#F9FAFB" rx={6} />
          {Array.from({ length: gridY + 1 }).map((_, i) => {
            const y = padding + (innerH / gridY) * i;
            return <line key={i} x1={padding} y1={y} x2={w - padding} y2={y} stroke="#E5E7EB" />;
          })}
          {xTicks.map((d) => {
            const idx = Math.min(n - 1, Math.max(0, d - 1));
            const x = toX(idx);
            return <line key={`v-${d}`} x1={x} y1={padding} x2={x} y2={h - padding} stroke="#F3F4F6" />;
          })}
          {values.map((v, i) => {
            const x = toX(i) - barW / 2;
            const y = toY(v);
            const hh = Math.max(0, h - padding - y);
            return (
              <g key={i}>
                <rect x={x} y={y} width={barW} height={hh} fill={color} />
                <text x={x + barW / 2} y={Math.max(padding + 12, y - 6)} textAnchor="middle" fontSize={11} fill="#374151">
                  {v}
                </text>
              </g>
            );
          })}
          <line x1={padding} y1={h - padding} x2={w - padding} y2={h - padding} stroke="#9CA3AF" />
          <line x1={padding} y1={padding} x2={padding} y2={h - padding} stroke="#9CA3AF" />
          {xTicks.map((d) => {
            const idx = Math.min(n - 1, Math.max(0, d - 1));
            const x = toX(idx);
            return (
              <text key={`xl-${d}`} x={x} y={h - padding + 14} textAnchor="middle" fontSize={11} fill="#6B7280">
                {d}
              </text>
            );
          })}
          <text x={padding - 6} y={h - padding + 4} textAnchor="end" fontSize={11} fill="#6B7280">0</text>
          <text x={padding - 6} y={padding + 4} textAnchor="end" fontSize={11} fill="#6B7280">{max}</text>
        </svg>
      </div>
    );
  }

  function PieChart({ data, size = 160, onItemClick }: { data: { label: string; value: number; color: string; uid?: string }[]; size?: number; onItemClick?: (item: { label: string; value: number; color: string; uid?: string }) => void }) {
    const total = data.reduce((sum, d) => sum + (d.value || 0), 0);
    const segments = [] as string[];
    let acc = 0;
    data.forEach((d) => {
      const pct = total > 0 ? (d.value / total) * 100 : 0;
      const start = acc;
      const end = acc + pct;
      segments.push(`${d.color} ${start}% ${end}%`);
      acc = end;
    });
    const bg = total > 0 ? `conic-gradient(${segments.join(', ')})` : `conic-gradient(#E5E7EB 0% 100%)`;
    return (
      <div className="flex items-center gap-6">
        <div
          className="rounded-full"
          style={{ width: size, height: size, background: bg }}
          aria-label="Gráfico de pizza"
        />
        <div className="flex-1 space-y-2">
          {data.map((d) => (
            <div key={d.label} className="flex items-center justify-between cursor-pointer hover:bg-surface-gray rounded px-2 py-1" onClick={() => onItemClick?.(d)}>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded" style={{ background: d.color }} />
                <UserProfiles uidUser={d.uid} />
              </div>
              <span className="text-sm font-medium text-gray-text">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px]">
      <PageHeader title="Controle" />
      <div className="px-4 py-4 space-y-4">
        <section className="bg-white border rounded-lg p-6 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-text">Painel de Controle</h2>
            <div className="relative">
              <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-gray border rounded" onClick={() => setUnitMenuOpen((v) => !v)}>
                <span>{selectedUnit ? (unitOptions.find((u) => u.code === selectedUnit)?.titulo || selectedUnit) : 'Selecionar unidade'}</span>
              </button>
              {unitMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border rounded shadow-card z-10">
                  <div className="max-h-64 overflow-auto">
                    {unitOptions.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-light">Nenhuma unidade disponível</div>
                    ) : (
                      unitOptions.map((u) => (
                        <button key={u.code} className="w-full text-left px-4 py-2 hover:bg-surface-gray" onClick={() => { setSelectedUnit(u.code); setUnitMenuOpen(false); }}>
                          {u.titulo}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <p className="text-sm text-gray-light">Unidade atual: {selectedUnit || '—'}</p>
            <label className="text-sm text-gray-text">Mês</label>
            <input
              type="month"
              className="border rounded px-3 py-2 text-sm"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
            />
          </div>
        </section>

        <section className="bg-white border rounded-lg p-6 shadow-card">
          <h3 className="text-base font-semibold text-gray-text mb-4">Cotas do mês vs escalas realizadas</h3>
          <PieChart
            data={[
              { label: 'Efetivo escalado', value: totalEfetivoMes, color: '#16A34A' },
              { label: 'Restante da cota', value: Math.max(0, monthlyQuota - totalEfetivoMes), color: '#9CA3AF' },
            ]}
          />
          <div className="mt-3 text-xs text-gray-light">Cota ({monthKey}): {monthlyQuota} • Cumprido: {quotaProgress}%</div>
        </section>

        <section className="bg-white border rounded-lg p-6 shadow-card">
          <h3 className="text-base font-semibold text-gray-text mb-2">Extras por dia (mês {monthKey})</h3>
          <p className="text-xs text-gray-light mb-3">Quantidade de efetivo escalado por dia.</p>
          <BarChart values={dailySeries} labels={Array.from({ length: daysInMonth }).map((_, i) => String(i + 1))} />
        </section>

        <section className="bg-white border rounded-lg p-6 shadow-card">
          <h3 className="text-base font-semibold text-gray-text mb-4">Membros escalados vs não escalados ({monthKey})</h3>
          <PieChart
            data={[
              { label: 'Escalados', value: servedCount, color: '#4F46E5' },
              { label: 'Não escalados', value: notServedCount, color: '#EF4444' },
            ]}
          />
          <div className="mt-3 text-xs text-gray-light">Total de membros: {membersCount}</div>
        </section>

        <TopContribuintes monthKey={monthKey} selectedUnit={selectedUnit} title='Extras por servidor'/>
      </div>
    </div>
  );
}
