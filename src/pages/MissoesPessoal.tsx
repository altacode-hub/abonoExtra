import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { auth, db } from '../services/firebase';
import { get, onValue, ref, update } from 'firebase/database';

type EscalaIndex = {
  unitId: string;
  titulo?: string;
  referencia?: string;
  local?: string;
  inicioTs?: number;
  fimTs?: number;
  funcao?: string;
};

type Status = { whatsSent?: boolean; whatsSentTs?: number; ack?: boolean; ackTs?: number };

export default function MissoesPessoal() {
  const [items, setItems] = useState<Array<{ month: string; id: string; data: EscalaIndex }>>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [toastMsg, setToastMsg] = useState<string>('');
  const [toastVisible, setToastVisible] = useState<boolean>(false);
  const [funcoesMap, setFuncoesMap] = useState<Record<string, string>>({});
  const [escalaDetailsMap, setEscalaDetailsMap] = useState<Record<string, any>>({});
  const [myProfile, setMyProfile] = useState<{ nomeGuerra?: string; nomeCompleto?: string; rg?: string; mf?: string; matriculaFuncional?: string } | null>(null);
  const uid = auth.currentUser?.uid || '';

  // Carrega todas as escalas do usuário em todos os meses
  useEffect(() => {
    if (!uid) return;
    const r = ref(db, `/userEscalas/${uid}`);
    const unsub = onValue(r, (snap) => {
      const val = snap.val() || {};
      const list: Array<{ month: string; id: string; data: EscalaIndex }> = [];
      const nextStatuses: Record<string, Status> = {};
      Object.entries(val).forEach(([month, byId]) => {
        Object.entries(byId || {}).forEach(([id, data]) => {
          list.push({ month, id, data: data as EscalaIndex });
          const s = (data as any)?.status || {};
          nextStatuses[`${month}/${id}`] = { whatsSent: !!s.whatsSent, whatsSentTs: s.whatsSentTs || 0, ack: !!s.ack, ackTs: s.ackTs || 0 };
        });
      });
      setItems(
        list
          .filter((it) => !!it.data?.inicioTs)
          // Ordena do mais recente para o mais antigo
          .sort((a, b) => (b.data.inicioTs || 0) - (a.data.inicioTs || 0))
      );
      setStatuses(nextStatuses);
    });
    return () => unsub();
  }, [uid]);

  // Confirma ciente e registra no banco de dados
  const confirmarCiente = async (month: string, escalaId: string) => {
    try {
      const statusRef = ref(db, `/userEscalas/${uid}/${month}/${escalaId}/status`);
      await update(statusRef, { ack: true, ackTs: Date.now() });
      setStatuses((prev) => ({ ...prev, [`${month}/${escalaId}`]: { ...(prev[`${month}/${escalaId}`] || {}), ack: true, ackTs: Date.now() } }));
      setToastMsg('Ciente registrado com sucesso');
      setToastVisible(true);
      window.setTimeout(() => setToastVisible(false), 2200);
      window.setTimeout(() => setToastMsg(''), 2600);
    } catch {}
  };

  const itemsByDay = useMemo(() => {
    return items.map((it) => ({
      ...it,
      dateStr: new Date(it.data.inicioTs || 0).toLocaleDateString('pt-BR'),
      timeStr: new Date(it.data.inicioTs || 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' - ' +
        new Date(it.data.fimTs || 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    }));
  }, [items]);

  // Backfill de função a partir da escala quando não existir em userEscalas
  useEffect(() => {
    if (!uid) return;
    const fetchMissingFuncoes = async () => {
      const promises = items.map(async ({ month, id, data }) => {
        const key = `${month}/${id}`;
        if (data.funcao) return { key, funcao: data.funcao };
        try {
          const snap = await get(ref(db, `/units/${data.unitId}/escalas/${month}/${id}/efetivo`));
          const efetivo = snap.val() || {};
          const f = efetivo[uid]?.funcao || '';
          return { key, funcao: f };
        } catch {
          return { key, funcao: '' };
        }
      });
      const results = await Promise.all(promises);
      const map: Record<string, string> = {};
      results.forEach(({ key, funcao }) => { if (funcao) map[key] = funcao; });
      if (Object.keys(map).length) setFuncoesMap((prev) => ({ ...prev, ...map }));
    };
    fetchMissingFuncoes().catch(() => {});
  }, [items, uid]);

  useEffect(() => {
    if (!uid) return;
    const fetchDetails = async () => {
      const promises = items.map(async ({ month, id, data }) => {
        const key = `${month}/${id}`;
        try {
          const snap = await get(ref(db, `/units/${data.unitId}/escalas/${month}/${id}`));
          const val = snap.val() || {};
          return { key, val };
        } catch {
          return { key, val: {} };
        }
      });
      const results = await Promise.all(promises);
      const map: Record<string, any> = {};
      results.forEach(({ key, val }) => { map[key] = val; });
      if (Object.keys(map).length) setEscalaDetailsMap((prev) => ({ ...prev, ...map }));
    };
    fetchDetails().catch(() => {});
  }, [items, uid]);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const snap = await get(ref(db, `/users/${uid}/profile`));
        const val = snap.val() || {};
        setMyProfile({ nomeGuerra: val?.nomeGuerra, nomeCompleto: val?.nomeCompleto, rg: val?.rg, mf: val?.mf, matriculaFuncional: val?.matriculaFuncional });
      } catch {
        setMyProfile(null);
      }
    })();
  }, [uid]);

  // Mensagens de WhatsApp removidas desta tela: apenas registro no banco

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px] pb-6">
      <PageHeader title="Minhas Missões" />
      <div className="px-4 py-4 space-y-3">
        {itemsByDay.length === 0 ? (
          <p className="text-sm text-gray-light">Nenhuma missão encontrada para seu usuário.</p>
        ) : (
          itemsByDay.map(({ month, id, data }) => {
            const key = `${month}/${id}`;
            const details = escalaDetailsMap[key] || {};
            const startDate = new Date(data.inicioTs || 0);
            const endDate = new Date(data.fimTs || 0);
            const dateStartStr = startDate.toLocaleDateString('pt-BR');
            const dateEndStr = endDate.toLocaleDateString('pt-BR');
            const timeStartStr = startDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const timeEndStr = endDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const dowStr = startDate.toLocaleDateString('pt-BR', { weekday: 'long' }).toUpperCase();
            const fx = data.funcao || funcoesMap[key] || '';
            const efetivoCount = details.efetivoCount || (details.efetivo ? Object.keys(details.efetivo).length : undefined);
            const missionNumber = `${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, '0')}${String(startDate.getDate()).padStart(2, '0')}`;
            const mf = myProfile?.matriculaFuncional || myProfile?.mf || '';
            const rg = myProfile?.rg || '';
            const nome = myProfile?.nomeGuerra || myProfile?.nomeCompleto || '';
            const titulo = (details.titulo || data.titulo || 'Missão');
            const refLocal = (details.referencia || details.local || data.referencia || data.local || '');
            const horarioLine = `${timeStartStr} - ${timeEndStr}`;
            const dataHorarioLine = `${dateStartStr} às ${timeStartStr} até ${dateEndStr} às ${timeEndStr} (${dowStr})`;
            const bullet = `° ${nome}${rg ? ", RG " + rg : ''}${mf ? ", MF " + mf : ''}${fx ? " - " + fx : ''}`;

            const st = statuses[key] || {};
            const ackText = st.ackTs ? new Date(st.ackTs).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

            return (
              <div key={key} className="bg-white border rounded-lg p-4 shadow-card">
                <div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-gray-text">
                      {`Missão nº ${missionNumber} - ${titulo}${refLocal ? ' - ' + refLocal : ''}`}
                    </div>
                    <div className="text-sm text-gray-text mt-1">{`Data/horário: ${dataHorarioLine}`}</div>
                    <div className="text-sm text-gray-text">{`Local: ${details.local || data.local || ''}`}</div>
                    <div className="text-sm text-gray-text">{`Horário: ${horarioLine}`}</div>
                    <div className="text-sm text-gray-text mt-2">{`Efetivo Escalado${efetivoCount !== undefined ? ` (${efetivoCount})` : ''}:`}</div>
                    <div className="text-sm text-gray-text">{bullet}</div>
                    {st.ack ? (
                      <div className="mt-2 text-xs text-blue-600">Efetivo deu ciente{ackText ? ` — ${ackText}` : ''}</div>
                    ) : null}
                  </div>
                </div>
                {!st.ack && (
                  <div className="mt-3 flex justify-center">
                    <button
                      className="px-4 py-2 rounded text-sm bg-primary text-white border border-primary shadow-card-hover hover:bg-primary-dark transition focus:outline-none focus:ring-2 focus:ring-primary"
                      onClick={() => confirmarCiente(month, id)}
                    >
                      Dar ciente
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      {toastMsg && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 bg-black/80 text-white text-sm px-4 py-2 rounded shadow-lg transition-opacity duration-300 ${toastVisible ? 'opacity-100' : 'opacity-0'}`}>
          {toastMsg}
        </div>
      )}
    </div>
  </div>
  );
}
