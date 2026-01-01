import { useEffect, useMemo, useState } from 'react';
import { auth, db } from '../../services/firebase';
import { get, onValue, ref } from 'firebase/database';
import { useNavigate } from 'react-router-dom';
import { UserProfiles } from '../UserProfiles';

interface Props{
  title: string;
  monthKey: string;
  selectedUnit: string;
}

export default function TopContribuintes({ title, monthKey, selectedUnit }: Props) {
  const navigate = useNavigate();
  const [memberCounts, setMemberCounts] = useState<Record<string, { name: string; count: number }>>({});

  const [memberUids, setMemberUids] = useState<string[]>([]);
  useEffect(() => {
    if (!selectedUnit) return;
    const membersRef = ref(db, `/units/${selectedUnit}/members`);
    const unsubMembers = onValue(membersRef, (snap) => {
      const obj = snap.val() || {};
      const uids = Object.keys(obj);
      setMemberUids(uids);
    });
    return () => {
      unsubMembers();
    };
  }, [selectedUnit, monthKey]);

  useEffect(() => {
    (async () => {
      if (!selectedUnit || memberUids.length === 0) {
        setMemberCounts({});
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
        } catch {
          countsByUid[uid] = 0;
        }
      }
      const counts: Record<string, { name: string; count: number }> = {};
      Object.entries(countsByUid).forEach(([uid, v]) => {
        if (v > 0) counts[uid] = { name: names[uid] || uid, count: v };
      });
      setMemberCounts(counts);
    })();
  }, [selectedUnit, monthKey, memberUids]);

  const MemberExtrasPieData = useMemo(() => {
    const entries = Object.entries(memberCounts);
    if (entries.length === 0) return [] as { label: string; value: number; color: string; uid?: string }[];
    entries.sort((a, b) => b[1].count - a[1].count);
    const palette = ['#1D4ED8', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#22C55E', '#E11D48', '#0EA5E9'];
    const top = entries.slice(0, 8);
    const rest = entries.slice(8);
    const data: { label: string; value: number; color: string; uid?: string }[] = top.map(([uid, info], i) => ({ label: info.name, value: info.count, color: palette[i % palette.length], uid }));
    if (rest.length > 0) {
      const others = rest.reduce((sum, e) => sum + e[1].count, 0);
      data.push({ label: 'Outros', value: others, color: '#9CA3AF' });
    }
    return data;
  }, [memberCounts]);


  async function openEfetivoDetails(uid?: string) {
    if (!uid || !selectedUnit) return;
    try {
      const escSnap = await get(ref(db, `/units/${selectedUnit}/escalas/${monthKey}`));
      const byId = escSnap.val() || {};
      const diasAll: string[] = [];
      const jornadas: Array<{ dia: string; titulo?: string; referencia?: string; local?: string }> = [];
      let efetivoInfo: any = {};
      Object.values(byId).forEach((esc: any) => {
        const ef = esc?.efetivo || {};
        const info = ef?.[uid];
        if (info) {
          const ts = Number(esc?.inicioTs || esc?.fimTs || 0);
          if (ts) {
            const dt = new Date(ts);
            const dd = String(dt.getDate()).padStart(2, '0');
            const mm = String(dt.getMonth() + 1).padStart(2, '0');
            const dia = `${dd}/${mm}`;
            diasAll.push(dia);
            jornadas.push({ dia, titulo: esc?.titulo, referencia: esc?.referencia, local: esc?.local });
          }
          efetivoInfo = { ...(efetivoInfo || {}), ...info };
        }
      });
      const perfilSnap = await get(ref(db, `/users/${uid}/profile`));
      const perfil = perfilSnap.val() || {};
      const nomeCompleto = efetivoInfo?.nomeCompleto || perfil?.nomeCompleto || '';
      const nome = efetivoInfo?.nome || efetivoInfo?.ng || perfil?.nomeGuerra || uid;
      const cpf = efetivoInfo?.cpf || perfil?.cpf || '';
      const mf = efetivoInfo?.matriculaFuncional || perfil?.mf || '';
      const dias = diasAll.slice().sort((a, b) => {
        const [da, ma] = a.split('/').map(Number);
        const [dbb, mb] = b.split('/').map(Number);
        if (ma !== mb) return ma - mb;
        return da - dbb;
      });
      const [yStr, mStr] = monthKey.split('-');
      const inicio = `${yStr}-${mStr}-01`;
      const fim = `${yStr}-${mStr}-${String(new Date(Number(yStr), Number(mStr), 0).getDate()).padStart(2, '0')}`;
      navigate('/planilha/efetivo', {
        state: {
          efetivo: { nomeCompleto, nome, cpf, matriculaFuncional: mf, dias },
          unidade: selectedUnit,
          periodo: { inicio, fim },
          totalJornadas: diasAll.length,
          uniqueDaysCount: Array.from(new Set(diasAll)).length,
          jornadas
        }
      });
    } catch {}
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
    <section className="bg-white border rounded-lg p-6 shadow-card" title={title}>
        <h3 className="text-base font-semibold text-gray-text mb-4">Extras por servidor (mês {monthKey})</h3>
        <PieChart data={MemberExtrasPieData} onItemClick={(item) => openEfetivoDetails(item.uid)} />
        <div className="mt-3 text-xs text-gray-light">Mostrando top contribuintes; demais agrupados em "Outros".</div>
    </section>
  );
}
