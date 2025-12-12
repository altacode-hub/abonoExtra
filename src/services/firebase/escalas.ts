export const slugifyRef = (s: string) => {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
};

export const makeEscalaId = (
  dateStr: string,
  missionId: string,
  referencia?: string,
  local?: string
) => {
  const baseDate = (dateStr || '').trim();
  const refSlug = slugifyRef(referencia || local || missionId || 'missao');
  return `${baseDate}_${refSlug || 'missao'}`;
};

export const parseHorarioToISO = (horario?: string, dateStr?: string) => {
  if (!horario || !dateStr) return { inicio: '', fim: '', inicioTs: 0, fimTs: 0 };
  const norm = horario.replace(/\s+/g, '');
  const m = norm.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (!m) return { inicio: '', fim: '', inicioTs: 0, fimTs: 0 };
  const toPad = (t: string) => {
    const [h, min] = t.split(':');
    const hh = String(h).padStart(2, '0');
    return `${hh}:${min}`;
  };
  const start = toPad(m[1]);
  const end = toPad(m[2]);
  const inicio = `${dateStr}T${start}`;
  const fim = `${dateStr}T${end}`;
  const inicioTs = Date.parse(inicio) || 0;
  const fimTs = Date.parse(fim) || 0;
  return { inicio, fim, inicioTs, fimTs };
};

export type EfetivoEntry = { 
  ng: string;        // Nome de guerra
  rg: string;        // RG
  nomeCompleto?: string;  // Nome completo
  cpf?: string;      // CPF
  matriculaFuncional?: string; // Matrícula funcional (MF)
  funcao?: string;   // Função
};

export const buildEfetivo = (
  selected: Record<string, boolean>,
  volunteersMap: Record<string, any>,
  extraAdditions: Record<string, { nome?: string; email?: string }>,
  profiles: Record<string, { 
    nomeGuerra?: string; 
    nomeCompleto?: string; 
    email?: string; 
    rg?: string;
    cpf?: string;
    matriculaFuncional?: string;
    mf?: string;
  }>,
  funcoes?: Record<string, string>
) => {
  const efetivo: Record<string, EfetivoEntry> = {};
  Object.entries(volunteersMap).forEach(([uid, e]) => {
    if (selected[uid]) {
      const profile = profiles[uid] || {};
      const ng = profile.nomeGuerra || (e as any)?.nome || uid;
      const rg = profile.rg || '';
      const nomeCompleto = profile.nomeCompleto || '';
      const cpf = profile.cpf || '';
      const matriculaFuncional = profile.matriculaFuncional || profile.mf || '';
      const funcao = (funcoes && funcoes[uid]) ? funcoes[uid] : undefined;
      
      const entry: EfetivoEntry = { 
        ng, 
        rg,
        nomeCompleto,
        cpf,
        matriculaFuncional
      };
      if (funcao !== undefined) entry.funcao = funcao;
      efetivo[uid] = entry;
    }
  });
  Object.entries(extraAdditions).forEach(([uid, e]) => {
    const profile = profiles[uid] || {};
    const ng = e.nome || uid;
    const funcao = (funcoes && funcoes[uid]) ? funcoes[uid] : undefined;
    const entry: EfetivoEntry = { 
      ng, 
      rg: profile.rg || '',
      nomeCompleto: profile.nomeCompleto || '',
      cpf: profile.cpf || '',
      matriculaFuncional: profile.matriculaFuncional || profile.mf || ''
    };
    if (funcao !== undefined) entry.funcao = funcao;
    efetivo[uid] = entry;
  });
  return efetivo;
};

export const buildEscalaFanout = (
  unit: string,
  date: string,
  escalaId: string,
  titulo: string,
  referencia: string,
  local: string,
  inicioTs: number,
  fimTs: number,
  efetivo: Record<string, EfetivoEntry>,
  inicio?: string,
  fim?: string
) => {
  const monthKey = (date || '').slice(0, 7);
  const efetivoCount = Object.keys(efetivo).length;
  const escalaFull = {
    titulo,
    referencia,
    local,
    inicio: inicio || '',
    fim: fim || '',
    inicioTs,
    fimTs,
    efetivo,
    efetivoCount,
    unitId: unit,
    createdAt: Date.now(),
  };

  const updates: Record<string, any> = {};
  updates[`/units/${unit}/escalas/${monthKey}/${escalaId}`] = escalaFull;
  updates[`/units/${unit}/escalasIndex/${monthKey}/${escalaId}`] = {
    titulo,
    referencia,
    local,
    inicioTs,
    fimTs,
    efetivoCount,
  };
  Object.keys(efetivo).forEach((uid) => {
    const baseUserEscala = {
      unitId: unit,
      titulo,
      referencia,
      local,
      inicioTs,
      fimTs,
    } as any;
    const fu = efetivo[uid]?.funcao;
    updates[`/userEscalas/${uid}/${monthKey}/${escalaId}`] = fu !== undefined
      ? { ...baseUserEscala, funcao: fu }
      : baseUserEscala;
  });
  return updates;
};
