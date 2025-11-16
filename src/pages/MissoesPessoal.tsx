import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { auth, db } from '../services/firebase';
import { get, onValue, ref, update } from 'firebase/database';
import { StatusWhatsNotSent, StatusWhatsSent, StatusAckGiven } from '../components/StatusIcons';

type EscalaIndex = {
  unitId: string;
  titulo?: string;
  referencia?: string;
  local?: string;
  inicioTs?: number;
  fimTs?: number;
};

type Status = { whatsSent?: boolean; whatsSentTs?: number; ack?: boolean; ackTs?: number };

export default function MissoesPessoal() {
  const [items, setItems] = useState<Array<{ month: string; id: string; data: EscalaIndex }>>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [detailsOpenKey, setDetailsOpenKey] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string>('');
  const [toastVisible, setToastVisible] = useState<boolean>(false);
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
          .sort((a, b) => (a.data.inicioTs || 0) - (b.data.inicioTs || 0))
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

  // Mensagens de WhatsApp removidas desta tela: apenas registro no banco

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px] pb-6">
      <PageHeader title="Minhas Missões" />
      <div className="px-4 py-4 space-y-3">
        {itemsByDay.length === 0 ? (
          <p className="text-sm text-gray-light">Nenhuma missão encontrada para seu usuário.</p>
        ) : (
          itemsByDay.map(({ month, id, data, dateStr, timeStr }) => (
            <div key={`${month}/${id}`} className="bg-white border rounded-lg p-4 shadow-card relative">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-light">{dateStr}</div>
                  <div className="text-lg font-semibold text-gray-text">{data.titulo || 'Missão'}</div>
                  <div className="text-sm text-gray-text">{data.referencia || data.local || ''}</div>
                  <div className="text-xs text-gray-light">{timeStr}</div>
                </div>
                {(() => {
                  const st = statuses[`${month}/${id}`] || {};
                  const key = `${month}/${id}`;
                  const ackText = st.ackTs ? new Date(st.ackTs).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
                  const whatsText = st.whatsSentTs ? new Date(st.whatsSentTs).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
                  return (
                    <div className="flex flex-col items-center gap-1">
                      <button type="button" className="w-6 h-6" onClick={() => setDetailsOpenKey((prev) => (prev === key ? null : key))} title="Ver detalhes do status" aria-label="Ver detalhes do status">
                        {st.ack ? (
                          <StatusAckGiven />
                        ) : st.whatsSent ? (
                          <StatusWhatsSent />
                        ) : (
                          <StatusWhatsNotSent />
                        )}
                      </button>
                      {ackText ? (
                        <div className="text-[11px] text-gray-light">{ackText}</div>
                      ) : whatsText ? (
                        <div className="text-[11px] text-gray-light">{whatsText}</div>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
              {detailsOpenKey === `${month}/${id}` && (
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={`status-title-${month}-${id}`}
                  className="absolute right-4 top-16 z-10 text-xs text-gray-text bg-white rounded px-3 py-2 border shadow-card w-64"
                  onKeyDown={(e) => { if (e.key === 'Escape') setDetailsOpenKey(null); }}
                >
                  <div id={`status-title-${month}-${id}`} className="font-semibold mb-1">Detalhes do status</div>
                  <div className="space-y-1">
                    <div>WhatsApp enviado: {statuses[`${month}/${id}`]?.whatsSent ? 'Sim' : 'Não'}</div>
                    {statuses[`${month}/${id}`]?.whatsSentTs ? (
                      <div>
                        Enviado em: {new Date(statuses[`${month}/${id}`]!.whatsSentTs!).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </div>
                    ) : null}
                    <div>Ciente: {statuses[`${month}/${id}`]?.ack ? 'Sim' : 'Não'}</div>
                    {statuses[`${month}/${id}`]?.ackTs ? (
                      <div>
                        Ciente em: {new Date(statuses[`${month}/${id}`]!.ackTs!).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button className="text-xs px-2 py-1 border rounded hover:bg-gray-50" onClick={() => setDetailsOpenKey(null)} autoFocus>
                      Fechar
                    </button>
                  </div>
                </div>
              )}
              <button
                className="mt-3 px-3 py-2 border rounded text-sm"
                onClick={() => confirmarCiente(month, id)}
              >
                Dar ciente
              </button>
            </div>
          ))
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