import { useEffect, useMemo, useState } from 'react';
import { onValue, ref, update, get, set } from 'firebase/database';
import { useSearchParams, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { db } from '../services/firebase';
import { buildEfetivo, buildEscalaFanout, makeEscalaId, parseHorarioToISO } from '../services/firebase/escalas';
import { WeeklyCalendar } from '../components/WeeklyCalendar';
import WhatsappIcon from '../components/WhatsappIcon';

type Enrollment = {
  userId: string;
  nome?: string;
  email?: string;
  status?: 'voluntario' | 'escalado' | string;
  funcao?: string;
  timestamp?: number;
  titulo?: string;
  referencia?: string;
  local?: string;
  tipo?: string;
  horario?: string;
};

export default function ConsolidarEscala() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const unit = params.get('unit') || '';
  const date = params.get('date') || '';
  const missionId = params.get('mission') || '';
  const [volunteersMap, setVolunteersMap] = useState<Record<string, Enrollment>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [extraAdditions, setExtraAdditions] = useState<Record<string, Enrollment>>({});
  const [previousStatus, setPreviousStatus] = useState<Record<string, string>>({});
  const [funcoes, setFuncoes] = useState<Record<string, string>>({});
  const [funcModalUid, setFuncModalUid] = useState<string | null>(null);
  const [funcCatalog, setFuncCatalog] = useState<Record<string, string>>({});
  const [funcSelectedKey, setFuncSelectedKey] = useState<string>('');
  const [newFuncLabel, setNewFuncLabel] = useState<string>('');
  const [savingNewFunc, setSavingNewFunc] = useState<boolean>(false);
  const [isCreatingFunc, setIsCreatingFunc] = useState<boolean>(false);
  const [rgQuery, setRgQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Record<string, { nome?: string; email?: string }>>({});
  const [hasClickedSearch, setHasClickedSearch] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, { nomeGuerra?: string; nomeCompleto?: string; email?: string; phone?: string }>>({});
  const [existingEscalas, setExistingEscalas] = useState<Set<string>>(new Set());
  const [missionForm, setMissionForm] = useState<{ titulo: string; referencia?: string; local?: string; tipo?: string; horario?: string }>({
    titulo: '',
    referencia: '',
    local: '',
    tipo: '',
    horario: '',
  });
  const [editOpen, setEditOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedDateIso, setSelectedDateIso] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(missionId || 'manual');
  const [templates, setTemplates] = useState<Record<string, {
    titulo: string;
    referencias?: string[];
    inicio?: string;
    fim?: string;
    repetir?: boolean;
    diasSemana?: number[];
    overrides?: { data: string; disponivel: boolean }[];
    local?: string;
    tipo?: string;
  }>>({});
  const [unitTitle, setUnitTitle] = useState<string>('');

  // Helpers movidos para services/firebase/escalas.ts

  // Cache local para busca por RG (por unidade)
  const cacheKey = `unitMembersCache:${unit}`;
  const loadCache = (): Record<string, { rg?: string; nome?: string; email?: string }> => {
    try {
      const raw = localStorage.getItem(cacheKey) || '{}';
      return JSON.parse(raw);
    } catch {
      return {};
    }
  };
  const saveCache = (data: Record<string, { rg?: string; nome?: string; email?: string }>) => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch {}
  };
  const normalizeRG = (s?: string) => (s ? String(s).replace(/\D/g, '') : '');

  const localSearchByRG = (query: string) => {
    const q = normalizeRG(query);
    if (!q) {
      setSearchResults({});
      return;
    }
    const cache = loadCache();
    const results: Record<string, { nome?: string; email?: string }> = {};
    Object.entries(cache).forEach(([uid, info]) => {
      if (info.rg && info.rg.includes(q)) {
        results[uid] = { nome: info.nome || uid, email: info.email || '' };
      }
    });
    setSearchResults(results);
  };

  useEffect(() => {
    const effectiveDate = selectedDateIso || date;
    const effectiveMission = (selectedTemplateId && selectedTemplateId !== 'manual')
      ? selectedTemplateId.split('::')[0]
      : (missionId || selectedTemplateId);
    if (!unit || !effectiveDate || !effectiveMission) return;
    const r = ref(db, `/units/${unit}/inscricoes/${effectiveDate}/${effectiveMission}`);
    const unsub = onValue(r, (snap) => {
      const val = snap.val() || {};
      setVolunteersMap(val);
      const initial: Record<string, boolean> = {};
      Object.entries(val).forEach(([uid, e]: any) => {
        if (e?.status === 'escalado') initial[uid] = true;
      });
      setSelected(initial);
    });
    return () => unsub();
  }, [unit, selectedDateIso, selectedTemplateId, date, missionId]);

  // Navegação direta para passo 4 quando vier da tela Escala com parâmetros completos
  useEffect(() => {
    if (date && missionId && missionId !== 'manual') {
      setSelectedDateIso(date);
      setSelectedTemplateId(missionId);
      setWizardStep(4);
    }
  }, [date, missionId]);

  // Preenche dados de referência/local/título/tipo/horário ao chegar da tela Escala
  useEffect(() => {
    if (!date || !missionId || missionId === 'manual') return;
    // missionId no formato `${templateId}:${idx}`
    const parts = missionId.split(':');
    const tplId = parts[0];
    const idx = parseInt(parts[1] || '0', 10);
    const tpl = templates[tplId];
    if (!tpl) return;
    const refLabel = Array.isArray(tpl.referencias) ? tpl.referencias[idx] : undefined;
    const horario = tpl.inicio && tpl.fim ? `${tpl.inicio} - ${tpl.fim}` : '';
    setMissionForm((prev) => ({
      titulo: tpl.titulo || prev.titulo || 'Missão',
      referencia: refLabel || prev.referencia || tpl.local || '',
      local: tpl.local || prev.local || '',
      tipo: tpl.tipo || prev.tipo || '',
      horario: horario || prev.horario || '',
    }));
  }, [date, missionId, templates]);

  // Carrega templates da unidade (modelos de missão)
  useEffect(() => {
    if (!unit) return;
    const r = ref(db, `/units/${unit}/missionTemplates`);
    const unsub = onValue(r, (snap) => {
      setTemplates(snap.val() || {});
    });
    return () => unsub();
  }, [unit]);

  // Carrega catálogo de funções pré-cadastradas na Configuração
  useEffect(() => {
    if (!unit) {
      setFuncCatalog({});
      return;
    }
    const r = ref(db, `/units/${unit}/settings/funcoes`);
    const unsub = onValue(r, (snap) => setFuncCatalog(snap.val() || {}));
    return () => unsub();
  }, [unit]);

  const slugify = (s: string) => (s || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  const addFuncaoInline = async () => {
    const label = newFuncLabel.trim();
    if (!unit || !label) return;
    const key = slugify(label);
    setSavingNewFunc(true);
    try {
      await update(ref(db, `/units/${unit}/settings/funcoes`), { [key]: label });
      setFuncSelectedKey(key);
      setNewFuncLabel('');
      setIsCreatingFunc(false);
    } finally {
      setSavingNewFunc(false);
    }
  };

  // Carrega escalas geradas (index por mês) para desabilitar seleção no passo 2 quando já houver escala
  useEffect(() => {
    if (!unit || !selectedDateIso) {
      setExistingEscalas(new Set());
      return;
    }
    const monthKey = (selectedDateIso || '').slice(0, 7);
    const r = ref(db, `/units/${unit}/escalasIndex/${monthKey}`);
    const unsub = onValue(r, (snap) => {
      const val = snap.val() || {};
      setExistingEscalas(new Set(Object.keys(val)));
    });
    return () => unsub();
  }, [unit, selectedDateIso]);

  // Carrega título da unidade para exibir na prévia
  useEffect(() => {
    if (!unit) {
      setUnitTitle('');
      return;
    }
    (async () => {
      try {
        const snap = await get(ref(db, `/units/${unit}/meta/titulo`));
        const t = snap.val();
        setUnitTitle(typeof t === 'string' ? t : '');
      } catch {
        setUnitTitle('');
      }
    })();
  }, [unit]);

  const availableTemplates = useMemo(() => {
    if (!selectedDateIso) return [] as Array<{ id: string; titulo: string; referencia?: string; local?: string; tipo?: string; inicio?: string; fim?: string }>;
    const d = new Date(selectedDateIso);
    const dow = d.getDay();
    const list: Array<{ id: string; titulo: string; referencia?: string; local?: string; tipo?: string; inicio?: string; fim?: string }> = [];
    Object.entries(templates || {}).forEach(([id, tpl]) => {
      let disponivel = tpl.repetir ? (tpl.diasSemana ? tpl.diasSemana.includes(dow) : true) : false;
      if (tpl.overrides && Array.isArray(tpl.overrides)) {
        const override = tpl.overrides.find((o) => o.data === selectedDateIso);
        if (override) disponivel = override.disponivel;
      }
      if (disponivel) {
        const refs = Array.isArray(tpl.referencias) && tpl.referencias.length > 0 ? tpl.referencias : [undefined];
        refs.forEach((refText) => {
          list.push({
            id,
            titulo: tpl.titulo,
            referencia: refText,
            local: tpl.local,
            tipo: tpl.tipo,
            inicio: tpl.inicio,
            fim: tpl.fim,
          });
        });
      }
    });
    const parseStart = (h?: string) => {
      if (!h) return Number.MAX_SAFE_INTEGER;
      const [hh, mm] = h.split(':');
      return (parseInt(hh || '0', 10) * 60) + parseInt(mm || '0', 10);
    };
    return list.sort((a, b) => parseStart(a.inicio) - parseStart(b.inicio));
  }, [templates, selectedDateIso]);

  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateId || selectedTemplateId === 'manual') return null;
    const key = selectedTemplateId;
    return availableTemplates.find((t) => `${t.id}::${t.referencia || ''}` === key) || null;
  }, [availableTemplates, selectedTemplateId]);

  // Carrega perfis para exibir nome de guerra dos voluntários listados e telefone
  useEffect(() => {
    const uids = Object.keys(volunteersMap);
    if (uids.length === 0) {
      setProfiles({});
      return;
    }
    let cancelled = false;
    (async () => {
      const entries: Record<string, { nomeGuerra?: string; nomeCompleto?: string; email?: string; phone?: string }> = {};
      await Promise.all(
        uids.map(async (uid) => {
          try {
            const snap = await get(ref(db, `/users/${uid}/profile`));
            const p = snap.val() || {};
            const rawPhone = p?.phone || p?.telefone || '';
            const phone = rawPhone ? String(rawPhone).replace(/[^0-9]/g, '') : '';
            entries[uid] = { nomeGuerra: p?.nomeGuerra, nomeCompleto: p?.nomeCompleto, email: p?.email, phone };
          } catch {
            // ignore erros de permissão
          }
        })
      );
      if (!cancelled) setProfiles(entries);
    })();
    return () => {
      cancelled = true;
    };
  }, [volunteersMap]);

  const missionMeta = useMemo(() => {
    const any = Object.values(volunteersMap)[0] as Enrollment | undefined;
    return {
      titulo: any?.titulo || 'Missão',
      referencia: any?.referencia,
      local: any?.local,
      tipo: any?.tipo,
      horario: any?.horario,
    };
  }, [volunteersMap]);

  // Inicializa o formulário com metadados conhecidos, mantendo alterações do usuário
  useEffect(() => {
    setMissionForm((prev) => ({
      titulo: prev.titulo || missionMeta.titulo || '',
      referencia: prev.referencia || missionMeta.referencia || '',
      local: prev.local || missionMeta.local || '',
      tipo: prev.tipo || missionMeta.tipo || '',
      horario: prev.horario || missionMeta.horario || '',
    }));
  }, [missionMeta]);

  // Abrir edição automaticamente se os campos estiverem vazios ou for missão manual
  useEffect(() => {
    const isEmpty = !missionMeta.referencia && !missionMeta.local && !missionMeta.tipo && !missionMeta.horario;
    if (!editOpen && (missionId === 'manual' || isEmpty)) {
      setEditOpen(true);
    }
  }, [missionId, missionMeta, editOpen]);

  const totalVolunteers = Object.keys(volunteersMap).length;
  const selectedUids = Object.keys(selected).filter((uid) => selected[uid]);
  const selectedCount = selectedUids.length;

  const toggleSelect = (uid: string) => {
    setSelected((prev) => ({ ...prev, [uid]: !prev[uid] }));
  };

  const finalize = async () => {
    const effectiveDate = selectedDateIso || date;
    const effectiveMission = (selectedTemplateId && selectedTemplateId !== 'manual')
      ? selectedTemplateId.split('::')[0]
      : (missionId || selectedTemplateId);
    if (!unit || !effectiveDate || !effectiveMission) return;
    const updates: Record<string, any> = {};
    Object.entries(volunteersMap).forEach(([uid, e]) => {
      const path = `/units/${unit}/inscricoes/${effectiveDate}/${effectiveMission}/${uid}/status`;
      updates[path] = selected[uid] ? 'escalado' : (e.status || 'voluntario');
    });
    // Novos adicionados (não voluntários)
    Object.entries(extraAdditions).forEach(([uid, e]) => {
      // Evita conflito: se já existe no volunteersMap, atualiza apenas o status
      if (volunteersMap[uid]) {
        const path = `/units/${unit}/inscricoes/${effectiveDate}/${effectiveMission}/${uid}/status`;
        updates[path] = 'escalado';
        return;
      }
      const basePath = `/units/${unit}/inscricoes/${effectiveDate}/${effectiveMission}/${uid}`;
      updates[basePath] = {
        userId: uid,
        nome: e.nome || uid,
        email: e.email || '',
        status: 'escalado',
        timestamp: Date.now(),
        titulo: missionForm.titulo || missionMeta.titulo || '',
        referencia: missionForm.referencia || missionForm.local || missionMeta.referencia || missionMeta.local || '',
        local: missionForm.local || missionMeta.local || '',
        tipo: missionForm.tipo || missionMeta.tipo || '',
        horario: missionForm.horario || missionMeta.horario || '',
      };
    });

    // Fan-out para estrutura otimizada de escalas (util)
    const escalaId = makeEscalaId(effectiveDate, effectiveMission, missionForm.referencia || missionMeta.referencia, missionForm.local || missionMeta.local);
    const { inicio, fim, inicioTs, fimTs } = parseHorarioToISO(missionForm.horario || missionMeta.horario, effectiveDate || undefined);
    const titulo = missionForm.titulo || missionMeta.titulo;
    const referencia = missionForm.referencia || missionForm.local || missionMeta.referencia || missionMeta.local || '';
    const local = missionForm.local || missionMeta.local || '';
    const efetivo = buildEfetivo(selected, volunteersMap as any, extraAdditions as any, profiles as any, funcoes);
    const escalaUpdates = buildEscalaFanout(unit, effectiveDate, escalaId, titulo, referencia, local, inicioTs, fimTs, efetivo, inicio, fim);
    Object.assign(updates, escalaUpdates);
    await update(ref(db), updates);
    navigate(`/escala?unit=${unit}&date=${effectiveDate}`);
  };

  const persistAdd = async (uid: string, nome?: string, email?: string) => {
    const effectiveDate = selectedDateIso || date;
    const effectiveMission = (selectedTemplateId && selectedTemplateId !== 'manual')
      ? selectedTemplateId.split('::')[0]
      : (missionId || selectedTemplateId);
    if (!unit || !effectiveDate || !effectiveMission) return;
    const updates: Record<string, any> = {};
    if (volunteersMap[uid]) {
      updates[`/units/${unit}/inscricoes/${effectiveDate}/${effectiveMission}/${uid}/status`] = 'escalado';
    } else {
      updates[`/units/${unit}/inscricoes/${effectiveDate}/${effectiveMission}/${uid}`] = {
        userId: uid,
        nome: nome || uid,
        email: email || '',
        status: 'escalado',
        timestamp: Date.now(),
        titulo: missionForm.titulo || missionMeta.titulo || '',
        referencia: missionForm.referencia || missionForm.local || missionMeta.referencia || missionMeta.local || '',
        local: missionForm.local || missionMeta.local || '',
        tipo: missionForm.tipo || missionMeta.tipo || '',
        horario: missionForm.horario || missionMeta.horario || '',
      };
    }
    await update(ref(db), updates);
  };

  const persistRemove = async (uid: string) => {
    const effectiveDate = selectedDateIso || date;
    const effectiveMission = (selectedTemplateId && selectedTemplateId !== 'manual')
      ? selectedTemplateId.split('::')[0]
      : (missionId || selectedTemplateId);
    if (!unit || !effectiveDate || !effectiveMission) return;
    const updates: Record<string, any> = {};
    if (volunteersMap[uid]) {
      const previous = previousStatus[uid] || 'voluntario';
      updates[`/units/${unit}/inscricoes/${effectiveDate}/${effectiveMission}/${uid}/status`] = previous;
    } else {
      // Remover inclusão extra
      updates[`/units/${unit}/inscricoes/${effectiveDate}/${effectiveMission}/${uid}`] = null;
    }
    await update(ref(db), updates);
  };

  const addSelected = (uid: string, nome?: string, email?: string) => {
    // Registra o status anterior do voluntário existente para permitir reversão correta
    if (volunteersMap[uid] && previousStatus[uid] === undefined) {
      const prev = volunteersMap[uid]?.status || 'voluntario';
      setPreviousStatus((ps) => ({ ...ps, [uid]: prev }));
    }
    setSelected((prev) => ({ ...prev, [uid]: true }));
    if (!volunteersMap[uid]) {
      setExtraAdditions((prev) => ({
        ...prev,
        [uid]: {
          userId: uid,
          nome: nome || uid,
          email: email || '',
          status: 'escalado',
        },
      }));
    }
    persistAdd(uid, nome, email).catch(() => {});
  };

  const removeSelected = (uid: string) => {
    setSelected((prev) => ({ ...prev, [uid]: false }));
    setExtraAdditions((prev) => {
      const copy = { ...prev };
      delete copy[uid];
      return copy;
    });
    persistRemove(uid).catch(() => {});
  };

  const searchByRG = async () => {
    if (!rgQuery.trim() || !unit) return;
    setSearching(true);
    setHasClickedSearch(true);
    setSearchResults({});
    try {
      // Normaliza o RG da consulta para apenas dígitos
      const normQuery = normalizeRG(rgQuery);
      const membersSnap = await get(ref(db, `/units/${unit}/members`));
      const members = membersSnap.val() || {};
      const results: Record<string, { nome?: string; email?: string }> = {};
      const cache = loadCache();
      for (const uid of Object.keys(members)) {
        try {
          const pSnap = await get(ref(db, `/users/${uid}/profile`));
          const prof = pSnap.val() || {};
          // Normaliza o RG do perfil para comparação robusta
          const normProfRg = normalizeRG(prof?.rg);
          // Atualiza cache local com dados do membro
          if (normProfRg) {
            cache[uid] = {
              rg: normProfRg,
              nome: prof?.nomeGuerra || prof?.nomeCompleto || uid,
              email: prof?.email || '',
            };
          }
          if (normProfRg && normProfRg === normQuery) {
            results[uid] = { nome: prof?.nomeGuerra || prof?.nomeCompleto || uid, email: prof?.email || '' };
          }
        } catch {
          // sem permissão
        }
      }
      saveCache(cache);
      setSearchResults(results);
    } catch {
      setSearchResults({});
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px] pb-6">
      <PageHeader title="Nova Escala" />
      <div className="px-4 py-4 space-y-4">
        {/* Barra de progressão (responsiva com rolagem horizontal) */}
        <nav className="bg-white border rounded-lg p-3 shadow-card overflow-x-auto overscroll-x-contain">
          <ol className="flex items-center justify-start gap-3 md:gap-4 whitespace-nowrap">
            {[
              { key: 1, label: 'Data' },
              { key: 2, label: 'Missão' },
              { key: 3, label: 'Dados' },
              { key: 4, label: 'Efetivo' },
            ].map((s, idx, arr) => (
              <li key={s.key} className="flex items-center flex-shrink-0 gap-2">
                <button
                  className={`flex items-center gap-2 px-1 md:px-2 py-1 rounded ${wizardStep === s.key ? 'text-primary' : 'text-gray-text'}`}
                  onClick={() => {
                    // Permitir voltar para passos anteriores
                    if (s.key <= wizardStep) setWizardStep(s.key as 1 | 2 | 3 | 4);
                  }}
                  title={s.label}
                >
                  <span
                    className={`w-5 h-5 md:w-6 md:h-6 inline-flex items-center justify-center rounded-full text-[11px] md:text-xs font-semibold ${
                      wizardStep === s.key ? 'bg-primary text-white' : 'bg-secondary/10 text-secondary'
                    }`}
                  >
                    {s.key}
                  </span>
                  <span className="text-xs md:text-sm">{s.label}</span>
                </button>
                {idx < arr.length - 1 && (
                  <span className={`inline-block mx-2 w-6 md:w-12 h-0.5 ${wizardStep > s.key ? 'bg-primary' : 'bg-gray-200'}`} />
                )}
              </li>
            ))}
          </ol>
        </nav>
        {/* Passo 1 — selecionar data */}
        {wizardStep === 1 && (
        <section className="bg-white border rounded-lg p-4 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-text">Selecione a data</h3>
            <span className="text-xs text-gray-light">{selectedDateIso || ''}</span>
          </div>
          <WeeklyCalendar
            selectedDate={selectedDateIso ? new Date(selectedDateIso) : undefined}
            onDateSelect={(d) => {
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const dd = String(d.getDate()).padStart(2, '0');
              setSelectedDateIso(`${y}-${m}-${dd}`);
              setWizardStep(2);
            }}
          />
        </section>
        )}

        {/* Passo 2 — escolher modelo ou manual */}
        {selectedDateIso && wizardStep === 2 && (
          <section className="bg-white border rounded-lg p-4 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-text">Missão</h2>
            </div>
            <ul className="divide-y rounded border">
              {availableTemplates.length === 0 ? (
                <li
                  className={`flex items-center justify-between px-3 py-3 cursor-pointer ${selectedTemplateId === 'manual' ? 'bg-surface-muted' : ''}`}
                  onClick={() => {
                    setSelectedTemplateId('manual');
                    setWizardStep(3);
                  }}
                >
                  <span className="font-medium">Preencimento manual</span>
                  <span className="text-xs text-gray-light">Defina os dados da missão no próximo passo</span>
                </li>
              ) : (
                <>
                  {availableTemplates.map((t) => {
                    const escalaId = makeEscalaId(selectedDateIso, t.id, t.referencia, t.local);
                    const isGenerated = existingEscalas.has(escalaId);
                    const key = `${t.id}::${t.referencia || ''}`;
                    return (
                      <li
                        key={key}
                        className={`flex items-center gap-4 px-3 py-3 ${isGenerated ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'} ${selectedTemplateId === key ? 'bg-surface-muted' : ''}`}
                        onClick={() => {
                          if (isGenerated) return;
                          setSelectedTemplateId(key);
                          setWizardStep(4);
                          setMissionForm((f) => ({
                            titulo: t.titulo || f.titulo,
                            referencia: t.referencia || f.referencia,
                            local: t.local || f.local,
                            tipo: t.tipo || f.tipo,
                            horario: t.inicio && t.fim ? `${t.inicio} - ${t.fim}` : (f.horario || ''),
                          }));
                        }}
                      >
                        <div className="w-16 flex flex-col">
                          <span className="text-lg font-semibold text-gray-text">{t.inicio || ''}</span>
                          <span className="text-xs text-gray-light">{t.fim || ''}</span>
                        </div>
                        <div className="flex-1 flex flex-col">
                          <span className="font-medium">{t.titulo}</span>
                          <span className="text-xs text-gray-light uppercase">{t.referencia || ''}</span>
                        </div>
                        {isGenerated && (
                          <span className="text-xs text-error font-medium">Escala já gerada</span>
                        )}
                      </li>
                    );
                  })}
                  <li
                    className={`flex items-center justify-between px-3 py-3 hover:bg-gray-50 cursor-pointer ${selectedTemplateId === 'manual' ? 'bg-surface-muted' : ''}`}
                    onClick={() => {
                      setSelectedTemplateId('manual');
                      setWizardStep(3);
                    }}
                  >
                    <span className="font-medium">Preencimento manual</span>
                    <span className="text-xs text-gray-light">Defina os dados da missão no próximo passo</span>
                  </li>
                </>
              )}
            </ul>
          </section>
        )}
        {/* Passo 3 — dados da missão */}
        {wizardStep === 3 && (
        <section className="bg-white border rounded-lg p-4 shadow-card">
          <div className="flex items-center mb-2">
            <h2 className="text-lg font-semibold text-gray-text">Dados da missão</h2>
          </div>
          {editOpen ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-light">Título</span>
                <input
                  type="text"
                  className="border rounded px-3 py-2"
                  value={missionForm.titulo}
                  onChange={(e) => setMissionForm((f) => ({ ...f, titulo: e.target.value }))}
                  placeholder="Ex.: Operação Urbana"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-light">Referência</span>
                <input
                  type="text"
                  className="border rounded px-3 py-2"
                  value={missionForm.referencia}
                  onChange={(e) => setMissionForm((f) => ({ ...f, referencia: e.target.value }))}
                  placeholder="Ex.: Setor 1"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-light">Local</span>
                <input
                  type="text"
                  className="border rounded px-3 py-2"
                  value={missionForm.local}
                  onChange={(e) => setMissionForm((f) => ({ ...f, local: e.target.value }))}
                  placeholder="Ex.: Quartel Central"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-light">Tipo</span>
                <input
                  type="text"
                  className="border rounded px-3 py-2"
                  value={missionForm.tipo}
                  onChange={(e) => setMissionForm((f) => ({ ...f, tipo: e.target.value }))}
                  placeholder="Ex.: Patrulha"
                />
              </label>
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs text-gray-light">Horário</span>
                <input
                  type="text"
                  className="border rounded px-3 py-2"
                  value={missionForm.horario}
                  onChange={(e) => setMissionForm((f) => ({ ...f, horario: e.target.value }))}
                  placeholder="Ex.: 06:00 - 12:00"
                />
              </label>
            </div>
          ) : (
            <div className="text-sm text-gray-text">
              <div className="font-semibold">{missionForm.titulo || missionMeta.titulo}</div>
              <div className="text-gray-light">{missionForm.referencia || missionForm.local || missionMeta.referencia || missionMeta.local || '-'}</div>
              <div className="text-xs text-gray-500">{missionForm.tipo || missionMeta.tipo || ''} • {missionForm.horario || missionMeta.horario || ''}</div>
            </div>
          )}
        {selectedCount > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-100">
            <div className="text-sm font-medium text-gray-text mb-2">Efetivo escalado ({selectedCount})</div>
            <div className="flex flex-wrap gap-2">
              {selectedUids.map((uid) => {
                const v = volunteersMap[uid] || extraAdditions[uid];
                return (
                  <span
                    key={uid}
                    className="inline-flex items-center gap-2 bg-gray-50 rounded px-2 py-1 text-xs cursor-pointer"
                    onClick={() => removeSelected(uid)}
                    title="Remover do efetivo escalado"
                  >
                    <span className="font-medium text-gray-text">{v?.nome || uid}</span>
                    {v?.email && <span className="text-gray-light">{v.email}</span>}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button className="px-4 py-2 border rounded" onClick={() => setWizardStep(2)}>Voltar</button>
          <button className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark" onClick={() => setWizardStep(4)}>Avançar</button>
        </div>
      </section>
        )}

        {/* Passo 4 — selecionar efetivo */}
        {wizardStep === 4 && (
        <section className="bg-white border rounded-lg p-4 shadow-card">
          <h3 className="text-md font-medium text-gray-text mb-2">Selecionar efetivo</h3>

          {/* Busca por RG para adicionar não voluntário */}
          <div className="mb-3 flex items-end gap-2">
            <label className="flex-1">
              <span className="block text-xs text-gray-light mb-1">Adicionar por RG</span>
              <input
                type="text"
                value={rgQuery}
                onChange={(e) => {
                  const v = e.target.value;
                  setRgQuery(v);
                  setHasClickedSearch(false);
                  localSearchByRG(v);
                }}
                placeholder="Digite o RG do efetivo"
                className="w-full border rounded px-3 py-2"
              />
            </label>
            <button className="px-3 py-2 border rounded" onClick={searchByRG} disabled={searching}>Pesquisar</button>
          </div>
          {Object.keys(searchResults).length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-secondary mb-1">Resultados</div>
              <ul className="divide-y">
                {Object.entries(searchResults)
                  .filter(([uid]) => !selected[uid])
                  .map(([uid, info]) => (
                  <li
                    key={uid}
                    className="py-2 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                    onClick={() => addSelected(uid, info.nome, info.email)}
                    title="Adicionar ao efetivo escalado"
                  >
                    <div>
                      <div className="font-medium">{info.nome || uid}</div>
                      {info.email && <div className="text-sm text-gray-light">{info.email}</div>}
                    </div>
                    <span className="text-xs text-secondary">Adicionar</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!searching && hasClickedSearch && rgQuery.trim() && Object.keys(searchResults).length === 0 && (
            <p className="text-xs text-gray-500 mb-3">Nenhum membro da unidade encontrado com esse RG.</p>
          )}

          {totalVolunteers === 0 ? (
            <p className="text-sm text-gray-light">Nenhum voluntário inscrito nesta escala.</p>
          ) : (
            <ul className="divide-y">
              {Object.entries(volunteersMap).filter(([uid]) => !selected[uid]).map(([uid, v]) => (
                <li
                  key={uid}
                  className="py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                  onClick={() => addSelected(uid, v.nome, v.email)}
                  title="Adicionar ao efetivo escalado"
                >
                  <div>
                    <div className="font-medium">{profiles[uid]?.nomeGuerra || profiles[uid]?.nomeCompleto || v.nome || uid}</div>
                    {v.email && <div className="text-sm text-gray-light">{v.email}</div>}
                  </div>
                  <span className="text-xs text-gray-500">{selected[uid] ? 'selecionado' : (v.status || 'voluntario')}</span>
                </li>
              ))}
            </ul>
          )}
          {/* Ações removidas conforme solicitado */}
        </section>
        )}

        {/* Prévia da escala preenchida */}
        <section className="bg-white border rounded-lg p-4 shadow-card">
          <h3 className="text-lg font-semibold text-gray-text mb-2">Prévia da escala</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-light">Unidade</span><span className="text-gray-text">{unitTitle || unit || '-'}</span></div>
            <div className="flex justify-between"><span className="text-gray-light">Data</span><span className="text-gray-text">{selectedDateIso || date || '-'}</span></div>
          <div className="flex justify-between"><span className="text-gray-light">Título</span><span className="text-gray-text">{wizardStep === 1 ? '' : (missionForm.titulo || missionMeta.titulo || '-')}</span></div>
            <div className="flex justify-between"><span className="text-gray-light">Referência</span><span className="text-gray-text">{missionForm.referencia || missionForm.local || missionMeta.referencia || missionMeta.local || '-'}</span></div>
            <div className="flex justify-between"><span className="text-gray-light">Local</span><span className="text-gray-text">{missionForm.local || missionMeta.local || '-'}</span></div>
            <div className="flex justify-between"><span className="text-gray-light">Tipo</span><span className="text-gray-text">{missionForm.tipo || missionMeta.tipo || '-'}</span></div>
            <div className="flex justify-between"><span className="text-gray-light">Horário</span><span className="text-gray-text">{missionForm.horario || missionMeta.horario || '-'}</span></div>
            <div className="flex flex-col items-start gap-2">
              <span className="text-gray-light">Efetivo escalado</span>
              <ul className="text-gray-text text-sm mt-2 space-y-2">
                {selectedUids.length === 0 ? (
                  <li>-</li>
                ) : (
                  selectedUids
                    .slice()
                    .sort((a, b) => {
                      const la = (funcoes[a] || volunteersMap[a]?.funcao || '').toLocaleLowerCase();
                      const lb = (funcoes[b] || volunteersMap[b]?.funcao || '').toLocaleLowerCase();
                      if (!la && !lb) return 0;
                      if (!la) return 1; // sem função vai para o final
                      if (!lb) return -1;
                      return la.localeCompare(lb);
                    })
                    .map((uid) => {
                    const displayName =
                      profiles[uid]?.nomeGuerra ||
                      extraAdditions[uid]?.nome ||
                      profiles[uid]?.nomeCompleto ||
                      volunteersMap[uid]?.nome ||
                      uid;
                    const email = volunteersMap[uid]?.email || '';
                    const funcLabel = funcoes[uid] || volunteersMap[uid]?.funcao || '';
                    return (
                      <li key={uid} className="group">
                        <div className="flex items-center gap-2">
                          <div
                            className="cursor-pointer group-hover:text-primary"
                            title="Definir função do efetivo"
                            onClick={() => {
                              setFuncModalUid(uid);
                              // tenta pré-selecionar a chave da função pelo label atual
                              const currentLabel = funcLabel || '';
                              const entry = Object.entries(funcCatalog).find(([, label]) => label === currentLabel);
                              setFuncSelectedKey(entry ? entry[0] : '');
                            }}
                          >
                            <span className="font-medium text-gray-text">{displayName}</span>
                            {funcLabel && (
                              <span className="ml-2 text-xs text-gray-light">• {funcLabel}</span>
                            )}
                          </div>
                          {/* Ícone WhatsApp ao lado de cada efetivo na prévia */}
                          <WhatsappIcon
                            phone={profiles[uid]?.phone}
                            text={`Voce foi escalado no dia ${new Date(Date.parse(selectedDateIso || date || '')).toLocaleDateString('pt-BR')}, confira suas escalas no link  https://abonoextra.web.app/missoesPessoal`}
                          />
                        </div>
                        {/* Editor flutuante controlado por estado global */}
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark" onClick={finalize}>Gerar escala</button>
          </div>
          {funcModalUid && (
            <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setFuncModalUid(null)}>
              <div className="bg-white rounded-lg shadow-card border p-4 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <h4 className="text-md font-semibold text-gray-text mb-2">Definir função</h4>
                {!isCreatingFunc ? (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-gray-light">Função pré-cadastrada</label>
                      <button className="text-xs text-primary" type="button" onClick={() => setIsCreatingFunc(true)}>
                        Nova função
                      </button>
                    </div>
                    <select
                      className="w-full border rounded px-3 py-2"
                      value={funcSelectedKey}
                      onChange={(e) => setFuncSelectedKey(e.target.value)}
                    >
                      <option value="">Selecione uma função</option>
                      {Object.entries(funcCatalog).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-gray-light">Cadastrar nova função</label>
                      <button className="text-xs" type="button" onClick={() => setIsCreatingFunc(false)}>
                        Cancelar
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="border rounded px-3 py-2 flex-1"
                        placeholder="Ex.: Comandante, Motorista"
                        value={newFuncLabel}
                        onChange={(e) => setNewFuncLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newFuncLabel.trim()) {
                            e.preventDefault();
                            addFuncaoInline();
                          }
                        }}
                      />
                      <button
                        className="px-3 py-2 bg-primary text-white rounded disabled:opacity-60"
                        onClick={addFuncaoInline}
                        disabled={savingNewFunc || !newFuncLabel.trim()}
                      >
                        Cadastrar
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-center mt-2">
                  <button
                    className="px-3 py-2 border rounded"
                    onClick={() => setFuncModalUid(null)}
                  >
                    Cancelar
                  </button>
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-2 border rounded text-error"
                      onClick={() => {
                        if (funcModalUid) {
                          removeSelected(funcModalUid);
                          setFuncModalUid(null);
                        }
                      }}
                      title="Excluir este efetivo da escala"
                    >
                      Excluir do efetivo
                    </button>
                    <button
                      className="px-3 py-2 bg-primary text-white rounded disabled:opacity-60"
                      onClick={() => {
                        if (!funcModalUid) return;
                        const label = funcSelectedKey ? (funcCatalog[funcSelectedKey] || '') : '';
                        setFuncoes((f) => ({ ...f, [funcModalUid]: label }));
                        // Persistir no registro de inscrição para reaparecer em futuras edições
                        const effectiveDate = selectedDateIso || date;
                        const effectiveMission = (selectedTemplateId && selectedTemplateId !== 'manual')
                          ? selectedTemplateId.split('::')[0]
                          : (missionId || selectedTemplateId);
                        if (unit && effectiveDate && effectiveMission) {
                          set(ref(db, `/units/${unit}/inscricoes/${effectiveDate}/${effectiveMission}/${funcModalUid}/funcao`), label).catch(() => {});
                        }
                        setFuncModalUid(null);
                      }}
                      disabled={!funcSelectedKey}
                    >
                      Salvar função
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}