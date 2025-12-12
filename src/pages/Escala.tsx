import { useEffect, useMemo, useState } from 'react';
import { onValue, ref, get, set } from 'firebase/database';
import PageHeader from '../components/PageHeader';
import { auth, db } from '../services/firebase';
import { WeeklyCalendar } from '../components/WeeklyCalendar';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MissionCard } from '../components/MissionCard';
import WhatsappIcon from '../components/WhatsappIcon';
import { StatusWhatsNotSent, StatusWhatsSent, StatusAckGiven } from '../components/StatusIcons';
import { makeEscalaId } from '../services/firebase/escalas';

type UnitMeta = { titulo: string; descricao?: string; cidade?: string };
type Enrollment = {
  userId: string;
  nome?: string;
  email?: string;
  status?: 'voluntario' | string;
  timestamp?: number;
  titulo?: string;
  referencia?: string;
  local?: string;
  tipo?: string;
  horario?: string; // HH:mm - HH:mm
  unit?: string;
  funcao?: string;
};

type MissionTemplate = {
  titulo: string;
  referencias: string[];
  funcoes?: string[];
  inicio: string; // HH:mm
  fim: string; // HH:mm
  repetir: boolean;
  diasSemana?: number[]; // 0-6
  overrides?: { data: string; disponivel: boolean }[]; // YYYY-MM-DD
  local?: string;
  tipo?: string;
};

type MissionAggregate = {
  id: string;
  titulo: string;
  referencia?: string;
  local?: string;
  tipo?: string;
  horario?: string;
  volunteers: { uid: string; nome: string; email?: string; status?: string; funcao?: string }[];
  inicioMin: number; // para ordenação
  turno: 'manha' | 'tarde' | 'noite';
};

export default function Escala() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [adminUnits, setAdminUnits] = useState<Record<string, UnitMeta>>({});
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [enrollments, setEnrollments] = useState<Record<string, Record<string, Enrollment>>>({});
  const [templates, setTemplates] = useState<Record<string, MissionTemplate>>({});
  const [finalizedEscalas, setFinalizedEscalas] = useState<Set<string>>(new Set());
  const [profilePhones, setProfilePhones] = useState<Record<string, string>>({});
  const [statusByUid, setStatusByUid] = useState<Record<string, { whatsSent?: boolean; ack?: boolean }>>({});

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
      // Carrega metadados de cada unidade para exibir títulos no select
      const updates: Record<string, UnitMeta> = {};
      let pending = codes.length;
      codes.forEach((code) => {
        const rMeta = ref(db, `/units/${code}/meta`);
        onValue(
          rMeta,
          (metaSnap) => {
            const meta = metaSnap.val() || { titulo: code };
            updates[code] = meta;
            pending -= 1;
            if (pending === 0) {
              setAdminUnits(updates);
              if (!selectedUnit) {
                // Preseleciona a última unidade usada (roles/<uid>/unitAtual) se existir e for válida
                get(ref(db, `/roles/${uid}/unitAtual`))
                  .then((lastSnap) => {
                    const last = (lastSnap.val() as string) || '';
                    if (last && updates[last]) {
                      setSelectedUnit(last);
                    } else {
                      setSelectedUnit(codes[0]);
                    }
                  })
                  .catch(() => setSelectedUnit(codes[0]));
              }
            }
          },
          { onlyOnce: true }
        );
      });
    });
    return () => unsub();
  }, [selectedUnit]);

  // Aplicar parâmetros de URL (date e unit) quando presentes
  useEffect(() => {
    const dateParam = params.get('date') || '';
    if (dateParam) {
      // Parse localmente para evitar deslocamento de UTC (YYYY-MM-DD vira UTC 00:00)
      const [yy, mm, dd] = dateParam.split('-');
      const y = parseInt(yy || '', 10);
      const m = parseInt(mm || '', 10);
      const d = parseInt(dd || '', 10);
      if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
        setSelectedDate(new Date(y, m - 1, d));
      }
    }
  }, [params]);

  useEffect(() => {
    const unitParam = params.get('unit') || '';
    if (unitParam && adminUnits[unitParam]) {
      setSelectedUnit(unitParam);
    }
  }, [params, adminUnits]);

  useEffect(() => {
    if (!selectedUnit || !selectedDate) return;
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    const dateIso = `${y}-${m}-${d}`;
    const r = ref(db, `/units/${selectedUnit}/inscricoes/${dateIso}`);
    const unsub = onValue(r, (snap) => setEnrollments(snap.val() || {}));
    return () => unsub();
  }, [selectedUnit, selectedDate]);

  // Carrega índice de escalas finalizadas para o mês atual
  useEffect(() => {
    if (!selectedUnit || !selectedDate) return;
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const monthKey = `${y}-${m}`;
    const r = ref(db, `/units/${selectedUnit}/escalasIndex/${monthKey}`);
    const unsub = onValue(r, (snap) => {
      const val = snap.val() || {};
      setFinalizedEscalas(new Set(Object.keys(val)));
    });
    return () => unsub();
  }, [selectedUnit, selectedDate]);

  // Carrega templates da unidade
  useEffect(() => {
    if (!selectedUnit) return;
    const r = ref(db, `/units/${selectedUnit}/missionTemplates`);
    const unsub = onValue(r, (snap) => setTemplates(snap.val() || {}));
    return () => unsub();
  }, [selectedUnit]);

  const parseStart = (h?: string) => {
    if (!h) return Number.MAX_SAFE_INTEGER;
    const start = h.split('-')[0]?.trim() || '00:00';
    const [hh, mm] = start.split(':');
    const hNum = parseInt(hh || '0', 10);
    const mNum = parseInt(mm || '0', 10);
    return hNum * 60 + mNum;
  };
  const turnoFromMin = (min: number): 'manha' | 'tarde' | 'noite' => {
    if (min < 12 * 60) return 'manha';
    if (min < 18 * 60) return 'tarde';
    return 'noite';
  };

  const dateIso = useMemo(() => {
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [selectedDate]);

  const dow = selectedDate.getDay(); // 0-6

  // Deriva lista de escalas a partir dos missionTemplates da unidade para o dia selecionado
  const dailyFromTemplates = useMemo(() => {
    const list: MissionAggregate[] = [];
    Object.entries(templates).forEach(([tid, t]) => {
      const hasOverride = (t.overrides || []).find((o) => o.data === dateIso);
      const availableByDow = t.repetir && (t.diasSemana || []).includes(dow);
      const available = hasOverride ? hasOverride.disponivel : availableByDow;
      if (!available) return;
      (t.referencias || []).forEach((refLabel, idx) => {
        const horario = `${t.inicio} - ${t.fim}`;
        const inicioMin = parseStart(horario);
        const missionId = `${tid}:${idx}`;
        const users = enrollments[missionId] || {};
        // Usa dados persistidos da inscrição como fonte da verdade para referencia/local
        const sample = Object.values(users)[0] as Enrollment | undefined;
        const refFromEnroll = (sample?.referencia || '').trim() || refLabel;
        const localFromEnroll = (sample?.local || '').trim() || t.local;
        list.push({
          id: missionId,
          titulo: t.titulo || 'Missão',
          referencia: refFromEnroll,
          local: localFromEnroll,
          tipo: t.tipo,
          horario,
          volunteers: Object.entries(users).map(([uid, e]) => ({ uid, nome: (e as Enrollment).nome || uid, email: (e as Enrollment).email, status: (e as Enrollment).status, funcao: (e as Enrollment).funcao })),
          inicioMin,
          turno: turnoFromMin(inicioMin),
        });
      });
    });
    // Ordenação cronológica crescente (mais cedo primeiro)
    return list.sort((a, b) => a.inicioMin - b.inicioMin);
  }, [templates, enrollments, dateIso, dow]);

  const unitOptions = Object.entries(adminUnits);

  // Carrega telefones (profile.phone) e status (whatsSent/ack) dos efetivos escalados do dia
  const [profileNamesByUid, setProfileNamesByUid] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!selectedUnit || !dateIso) return;
    const monthKey = (dateIso || '').slice(0, 7);
    // Agrega todos os escalados do dia nas missões derivadas
    const escalados: Array<{ uid: string; escalaId: string }> = [];
    dailyFromTemplates.forEach((m) => {
      const [tid] = (m.id || '').split(':');
      const escalaId = makeEscalaId(dateIso, tid, m.referencia, m.local);
      (m.volunteers || [])
        .filter((v) => (v.status || '') === 'escalado')
        .forEach((v) => escalados.push({ uid: v.uid, escalaId }));
    });
    if (escalados.length === 0) {
      setStatusByUid({});
      return;
    }
    (async () => {
      const nextPhones: Record<string, string> = { ...profilePhones };
      const nextStatus: Record<string, { whatsSent?: boolean; ack?: boolean }> = { ...statusByUid };
      const nextNames: Record<string, string> = { ...profileNamesByUid };
      for (const { uid, escalaId } of escalados) {
        // Telefone de perfil
        if (!nextPhones[uid]) {
          try {
            const snap = await get(ref(db, `/users/${uid}/profile`));
            const val = snap.val() || {};
            const phoneRaw = val?.phone || val?.telefone || '';
            if (phoneRaw) {
              const digits = String(phoneRaw).replace(/[^0-9]/g, '');
              // Garante formato E.164 brasileiro (prefixo 55)
              nextPhones[uid] = digits.startsWith('55') ? digits : (digits ? `55${digits}` : '');
            }
            const ng = val?.nomeGuerra || '';
            const nc = val?.nomeCompleto || '';
            if (!nextNames[uid]) nextNames[uid] = ng || nc || uid;
          } catch {}
        }
        // Status da escala do usuário
        try {
          const sSnap = await get(ref(db, `/userEscalas/${uid}/${monthKey}/${escalaId}/status`));
          const sVal = sSnap.val() || {};
          nextStatus[uid] = { whatsSent: !!sVal.whatsSent, ack: !!sVal.ack };
        } catch {}
      }
      setProfilePhones(nextPhones);
      setStatusByUid(nextStatus);
      setProfileNamesByUid(nextNames);
    })();
  }, [selectedUnit, dateIso, dailyFromTemplates.length]);

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px] pb-6">
      <PageHeader title="Escala" />
      {/* Calendário fixo abaixo do header */}
      <div className="sticky top-[68px] z-20 bg-surface-gray px-4 py-2 border-b border-gray-200">
        <WeeklyCalendar selectedDate={selectedDate} onDateSelect={setSelectedDate} />
      </div>
      <div className="px-4 py-4 space-y-4">
        {/* Seleção de unidade e data */}
        <section className="bg-white border rounded-lg p-4 shadow-card">
          <h2 className="text-lg font-semibold text-gray-text mb-3">Unidade</h2>
          {unitOptions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="flex flex-col gap-1">
                <select
                  className="bg-white border rounded px-3 py-2"
                  value={selectedUnit}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedUnit(value);
                    const uid = auth.currentUser?.uid;
                    if (uid) {
                      // Persistir unidade atual nas roles do usuário
                      set(ref(db, `/roles/${uid}/unitAtual`), value).catch(() => {});
                    }
                  }}
                >
                  {unitOptions.map(([code, meta]) => (
                    <option key={code} value={code}>
                      {meta.titulo || code}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <p className="text-sm text-gray-light">Você não é admin de nenhuma unidade.</p>
          )}
        </section>
        {/* Lista de escalas por dia em ordem cronológica decrescente */}
        {unitOptions.length > 0 && (
          <div>
            {dailyFromTemplates.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-light">Sem escalas geradas para o dia selecionado.</p>
              </div>
            ) : (
              <div>
                {dailyFromTemplates.map((m) => {
                  const mission = {
                    id: m.id,
                    titulo: m.titulo,
                    local: m.local || '',
                    data: dateIso,
                    horario: m.horario || '',
                    tipo: m.tipo || '',
                    inscrito: m.volunteers.length > 0,
                    disponivel: true,
                    referencia: m.referencia,
                    inscritoStatus: m.volunteers.some((v) => v.status === 'escalado')
                      ? 'escalado'
                      : m.volunteers.length > 0
                      ? 'voluntario'
                      : undefined,
                  };
                  const [tid] = m.id.split(':');
                  const escalaId = makeEscalaId(dateIso, tid, m.referencia, m.local);
                  const isFinalizada = finalizedEscalas.has(escalaId);
                  const escalados = m.volunteers.filter((v) => v.status === 'escalado');
                  const escaladosSorted = escalados
                    .slice()
                    .sort((a, b) => {
                      const la = (a.funcao || '').toLocaleLowerCase();
                      const lb = (b.funcao || '').toLocaleLowerCase();
                      if (!la && !lb) return 0;
                      if (!la) return 1; // sem função vai para o final
                      if (!lb) return -1;
                      return la.localeCompare(lb);
                    });
                  const voluntarios = m.volunteers.filter((v) => v.status !== 'escalado');
                  return (
                    <div
                      key={m.id}
                      className="cursor-pointer"
                      onClick={() =>
                        navigate(
                          `/escala/consolidar?unit=${selectedUnit}&date=${dateIso}&mission=${encodeURIComponent(m.id)}`
                        )
                      }
                    >
                      <MissionCard
                        mission={mission}
                        hideToggle
                        statusBadge={isFinalizada ? (
                          <span className="inline-block text-white bg-success rounded px-2 py-1 text-xs">Escala Finalizada</span>
                        ) : undefined}
                      >
                        {isFinalizada
                          ? escalados.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
                                <div className="text-xs text-secondary">Efetivo Escalado ({escalados.length})</div>
                                <div className="flex flex-wrap gap-2">
                                  {escaladosSorted.map((v) => (
                                    <span key={v.uid} className="inline-flex items-center gap-2 rounded px-2 py-1 text-xs">
                                      <span className="font-medium text-gray-text">{profileNamesByUid[v.uid] || v.nome}</span>
                                      {v.funcao && (
                                        <span className="text-xs text-gray-light">• {v.funcao}</span>
                                      )}
                                      {/* Ícone WhatsApp sem texto */}
                                      <WhatsappIcon
                                        phone={profilePhones[v.uid]}
                                        text={`Você foi escalado no dia ${selectedDate.toLocaleDateString('pt-BR')}, confira suas escalas no link https://abonoextra.web.app/missoesPessoal`}
                                        disabled={!profilePhones[v.uid]}
                                        onSent={() => {
                                          const monthKey = (dateIso || '').slice(0, 7);
                                          const [tid] = (m.id || '').split(':');
                                          const escalaId = makeEscalaId(dateIso, tid, m.referencia, m.local);
                                          const path = `/userEscalas/${v.uid}/${monthKey}/${escalaId}/status`;
                                          set(ref(db, path), { whatsSent: true, whatsSentTs: Date.now() }).catch(() => {});
                                          setStatusByUid((prev) => ({ ...prev, [v.uid]: { ...(prev[v.uid] || {}), whatsSent: true } }));
                                        }}
                                      />
                                      {/* Ícones de status reais: ack > whatsSent > não enviada */}
                                      {statusByUid[v.uid]?.ack ? (
                                        <StatusAckGiven />
                                      ) : statusByUid[v.uid]?.whatsSent ? (
                                        <StatusWhatsSent />
                                      ) : (
                                        <StatusWhatsNotSent />
                                      )}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )
                          : voluntarios.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
                                <div className="text-xs text-secondary">Efetivo Voluntário ({voluntarios.length})</div>
                                <div className="flex flex-wrap gap-2">
                                  {voluntarios.map((v) => (
                                    <span key={v.uid} className="inline-flex items-center gap-2 rounded px-2 py-1 text-xs">
                                      <span className="font-medium text-gray-text">{v.nome}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                      </MissionCard>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      {selectedUnit && adminUnits[selectedUnit] && (
        <button
          type="button"
          aria-label="Consolidar escala"
          className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-card hover:bg-primary-dark"
          onClick={() => navigate(`/escala/consolidar?unit=${selectedUnit}&date=${dateIso}&mission=manual`)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path fillRule="evenodd" d="M12 4.5a.75.75 0 01.75.75v6h6a.75.75 0 010 1.5h-6v6a.75.75 0 01-1.5 0v-6h-6a.75.75 0 010-1.5h6v-6A.75.75 0 0112 4.5z" clipRule="evenodd" />
          </svg>
        </button>
      )}
      {selectedUnit && adminUnits[selectedUnit] && (
        <button
          type="button"
          aria-label="Gerar PDF da escala"
          className="fixed bottom-6 right-20 w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-card hover:bg-red-700"
          onClick={() => navigate(`/escala/gerar-pdf?unit=${selectedUnit}&date=${dateIso}`)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 2 5 5h-5V4Zm-5 7h8v2H8v-2Zm0 4h8v2H8v-2Z" />
          </svg>
        </button>
      )}
    </div>
  );
}
