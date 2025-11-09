import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onValue, ref, set, remove, get } from 'firebase/database';
import { db } from '../services/firebase';
import { MissionCard } from './MissionCard';
import { auth } from '../services/firebase';

type UnitMeta = { titulo: string; descricao?: string; cidade?: string };

type Mission = {
  id: string;
  titulo: string;
  local: string;
  horario: string;
  tipo: string;
  disponivel?: boolean;
  referencia?: string;
};

type MissionTemplate = {
  titulo: string;
  referencias: string[];
  inicio: string; // HH:mm
  fim: string; // HH:mm
  repetir: boolean;
  diasSemana?: number[]; // 0-6
  overrides?: { data: string; disponivel: boolean }[]; // YYYY-MM-DD
  local?: string;
  tipo?: string;
};

type Props = {
  unitCode: string;
  unitMeta: UnitMeta;
  selectedDate: Date;
};

export default function UnitMissions({ unitCode, unitMeta, selectedDate }: Props) {
  const [missions, setMissions] = useState<Record<string, Mission>>({});
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Record<string, MissionTemplate>>({});
  const [myEnrollments, setMyEnrollments] = useState<Record<string, { status?: string; nome?: string; funcao?: string }>>({});
  const [myProfile, setMyProfile] = useState<{ nomeGuerra?: string; nomeCompleto?: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const d = new Date(selectedDate);
    d.setHours(0, 0, 0, 0);
    const dayKey = d.getTime();
    const r = ref(db, `/units/${unitCode}/missoes/${dayKey}`);
    setLoading(true);
    const unsub = onValue(r, (snap) => {
      const val = snap.val() || {};
      setMissions(val);
      setLoading(false);
    });
    return () => unsub();
  }, [unitCode, selectedDate]);

  // Carrega templates da unidade (modelos de missão)
  useEffect(() => {
    const r = ref(db, `/units/${unitCode}/missionTemplates`);
    const unsub = onValue(r, (snap) => {
      setTemplates(snap.val() || {});
    });
    return () => unsub();
  }, [unitCode]);

  const dateIso = useMemo(() => {
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [selectedDate]);

  const dow = selectedDate.getDay(); // 0-6

  // Inscrições do usuário atual para esta unidade e data
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    const dateIso = `${y}-${m}-${d}`;
    const r = ref(db, `/units/${unitCode}/inscricoes/${dateIso}`);
    const unsub = onValue(r, (snap) => {
      const val = snap.val() || {};
      const mine: Record<string, { status?: string; nome?: string; funcao?: string }> = {};
      Object.entries(val).forEach(([missionId, users]: any) => {
        const u = users?.[user.uid];
        if (u) {
          mine[missionId] = { status: u.status, nome: u.nome, funcao: u.funcao };
        }
      });
      setMyEnrollments(mine);
    });
    return () => unsub();
  }, [unitCode, selectedDate]);

  // Perfil do usuário (para Nome de Guerra)
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    (async () => {
      try {
        const snap = await get(ref(db, `/users/${user.uid}/profile`));
        const val = snap.val() || {};
        setMyProfile({ nomeGuerra: val?.nomeGuerra, nomeCompleto: val?.nomeCompleto });
      } catch {
        setMyProfile(null);
      }
    })();
  }, []);

  // Deriva missões de templates quando não há missões no dia
  const derivedFromTemplates: Mission[] = useMemo(() => {
    if (Object.keys(missions).length > 0) return [];
    const list: Mission[] = [];
    Object.entries(templates).forEach(([tid, t]) => {
      const hasOverride = (t.overrides || []).find((o) => o.data === dateIso);
      const availableByDow = t.repetir && (t.diasSemana || []).includes(dow);
      const available = hasOverride ? hasOverride.disponivel : availableByDow;
      if (!available) return;
      (t.referencias || []).forEach((refLabel, idx) => {
        list.push({
          id: `${tid}:${idx}`,
          titulo: t.titulo || 'Missão',
          local: t.local || unitMeta.titulo,
          horario: `${t.inicio} - ${t.fim}`,
          tipo: t.tipo || 'Missão',
          disponivel: true,
          referencia: refLabel,
        });
      });
    });
    function parseStart(h?: string) {
      if (!h) return Number.MAX_SAFE_INTEGER;
      const parts = h.split('-');
      const start = parts[0]?.trim() || '00:00';
      const [hh, mm] = start.split(':');
      const hNum = parseInt(hh || '0', 10);
      const mNum = parseInt(mm || '0', 10);
      return hNum * 60 + mNum;
    }
    return list.sort((a, b) => parseStart(a.horario) - parseStart(b.horario));
  }, [missions, templates, dateIso, dow, unitMeta.titulo]);

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-gray-text mb-3">{unitMeta.titulo}</h3>
      {loading ? (
        <div className="bg-surface rounded-lg shadow-card p-4 mb-3 animate-pulse">
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-3 bg-gray-200 rounded mb-1"></div>
          <div className="h-3 bg-gray-200 rounded"></div>
        </div>
      ) : (
        <div>
          {Object.keys(missions).length === 0 && derivedFromTemplates.length === 0 && (
            <div className="text-sm text-gray-light">Nenhuma missão disponível para o dia selecionado.</div>
          )}
          {Object.entries(missions)
            .sort((a, b) => {
              const parseStart = (h?: string) => {
                if (!h) return Number.MAX_SAFE_INTEGER;
                const parts = h.split('-');
                const start = parts[0]?.trim() || '00:00';
                const [hh, mm] = start.split(':');
                const hNum = parseInt(hh || '0', 10);
                const mNum = parseInt(mm || '0', 10);
                return hNum * 60 + mNum;
              };
              return parseStart(a[1].horario) - parseStart(b[1].horario);
            })
            .map(([id, m]) => (
              <MissionCard
                key={id}
                mission={{
                  id,
                  titulo: m.titulo,
                  local: m.local,
                  horario: m.horario,
                  tipo: m.tipo,
                  disponivel: m.disponivel ?? true,
                  data: selectedDate.toISOString().split('T')[0],
                  inscrito: !!myEnrollments[id],
                  inscritoStatus: myEnrollments[id]?.status as any,
                }}
                hideToggle={myEnrollments[id]?.status === 'escalado'}
                statusBadge={(() => {
                  const status = myEnrollments[id]?.status;
                  if (status === 'escalado') {
                    return (
                      <div className="flex flex-col items-start gap-1">
                        <div className="text-xs text-gray-text font-medium">{myProfile?.nomeGuerra || myEnrollments[id]?.nome || auth.currentUser?.displayName || ''}</div>
                        {myEnrollments[id]?.funcao && (
                          <div className="text-xs text-gray-light">{myEnrollments[id]?.funcao}</div>
                        )}
                        <span className="inline-block text-white bg-success rounded px-2 py-1 text-xs">
                          você está escalado para esta missão
                        </span>
                      </div>
                    );
                  }
                  if (status === 'voluntario') {
                    return <span className="inline-block text-secondary text-xs">você está como voluntário</span>;
                  }
                  if ((m.disponivel ?? true) === true) {
                    return <span className="inline-block text-secondary text-xs">precisa de voluntário</span>;
                  }
                  return null;
                })()}
                onToggle={(missionId, enrolled) => {
                  const user = auth.currentUser;
                  if (!user) return;
                  const dateIso = selectedDate.toISOString().split('T')[0];
                  const basePath = `/units/${unitCode}/inscricoes/${dateIso}/${missionId}/${user.uid}`;
                  if (enrolled) {
                    set(ref(db, basePath), {
                      userId: user.uid,
                      nome: user.displayName || '',
                      email: user.email || '',
                      status: 'voluntario',
                      timestamp: Date.now(),
                      titulo: m.titulo,
                      referencia: m.referencia || m.local,
                      local: m.local,
                      tipo: m.tipo,
                      horario: m.horario,
                      unit: unitCode,
                    });
                  } else {
                    remove(ref(db, basePath));
                  }
                }}
              />
            ))}
          {/* Mensagem removida conforme solicitado */}
          {derivedFromTemplates.map((m) => (
            <MissionCard
              key={m.id}
              mission={{
                id: m.id,
                titulo: m.titulo,
                local: m.local,
                horario: m.horario,
                tipo: m.tipo,
                disponivel: m.disponivel ?? true,
                data: dateIso,
                referencia: m.referencia,
                inscrito: !!myEnrollments[m.id],
                inscritoStatus: myEnrollments[m.id]?.status as any,
              }}
              hideToggle={myEnrollments[m.id]?.status === 'escalado'}
              statusBadge={(() => {
                const status = myEnrollments[m.id]?.status;
                if (status === 'escalado') {
                  return (
                    <span className="inline-block text-white bg-success rounded px-2 py-1 text-xs">
                      você está escalado para esta missão
                    </span>
                  );
                }
                if (status === 'voluntario') {
                  return <span className="inline-block text-secondary text-xs">você está como voluntário</span>;
                }
                if ((m.disponivel ?? true) === true) {
                  return <span className="inline-block text-secondary text-xs">precisa de voluntário</span>;
                }
                return null;
              })()}
              onToggle={(missionId, enrolled) => {
                const user = auth.currentUser;
                if (!user) return;
                const basePath = `/units/${unitCode}/inscricoes/${dateIso}/${missionId}/${user.uid}`;
                if (enrolled) {
                  set(ref(db, basePath), {
                    userId: user.uid,
                    nome: user.displayName || '',
                    email: user.email || '',
                    status: 'voluntario',
                    timestamp: Date.now(),
                    titulo: m.titulo,
                    referencia: m.referencia || m.local,
                    local: m.local,
                    tipo: m.tipo,
                    horario: m.horario,
                    unit: unitCode,
                  });
                } else {
                  remove(ref(db, basePath));
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}