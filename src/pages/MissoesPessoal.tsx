import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { auth, db } from '../services/firebase';
import { get, onValue, ref, update } from 'firebase/database';
import WhatsappIcon from '../components/WhatsappIcon';

type EscalaIndex = {
  unitId: string;
  titulo?: string;
  referencia?: string;
  local?: string;
  inicioTs?: number;
  fimTs?: number;
};

type Status = { whatsSent?: boolean; ack?: boolean; ackTs?: number };

export default function MissoesPessoal() {
  const [items, setItems] = useState<Array<{ month: string; id: string; data: EscalaIndex }>>([]);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const uid = auth.currentUser?.uid || '';

  // Carrega todas as escalas do usuário em todos os meses
  useEffect(() => {
    if (!uid) return;
    const r = ref(db, `/userEscalas/${uid}`);
    const unsub = onValue(r, (snap) => {
      const val = snap.val() || {};
      const list: Array<{ month: string; id: string; data: EscalaIndex }> = [];
      Object.entries(val).forEach(([month, byId]) => {
        Object.entries(byId || {}).forEach(([id, data]) => {
          list.push({ month, id, data: data as EscalaIndex });
        });
      });
      setItems(
        list
          .filter((it) => !!it.data?.inicioTs)
          .sort((a, b) => (a.data.inicioTs || 0) - (b.data.inicioTs || 0))
      );
    });
    return () => unsub();
  }, [uid]);

  // Carrega telefone do próprio usuário (se disponível)
  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const snap = await get(ref(db, `/users/${uid}/profile`));
        const val = snap.val() || {};
        const phone = val?.phone || val?.telefone || '';
        if (phone) setPhones({ [uid]: String(phone).replace(/[^0-9]/g, '') });
      } catch {}
    })();
  }, [uid]);

  const itemsByDay = useMemo(() => {
    return items.map((it) => ({
      ...it,
      dateStr: new Date(it.data.inicioTs || 0).toLocaleDateString('pt-BR'),
      timeStr: new Date(it.data.inicioTs || 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' - ' +
        new Date(it.data.fimTs || 0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    }));
  }, [items]);

  const openAckMessage = async (month: string, escalaId: string, displayDate: string) => {
    const msg = `Voce foi escalado no dia ${displayDate}, confira suas escalas no link https://abonoextra.web.app/missoesPessoal`;
    const phone = phones[uid];
    // Registra ACK no banco (proxy: clique solicita ciente)
    try {
      const statusRef = ref(db, `/userEscalas/${uid}/${month}/${escalaId}/status`);
      await update(statusRef, { ack: true, ackTs: Date.now() });
    } catch {}
    // Abre WhatsApp com a mensagem
    const encoded = encodeURIComponent(msg);
    const base = 'https://wa.me';
    const href = phone ? `${base}/${phone}?text=${encoded}` : `${base}/?text=${encoded}`;
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px] pb-6">
      <PageHeader title="Minhas Missões" />
      <div className="px-4 py-4 space-y-3">
        {itemsByDay.length === 0 ? (
          <p className="text-sm text-gray-light">Nenhuma missão encontrada para seu usuário.</p>
        ) : (
          itemsByDay.map(({ month, id, data, dateStr, timeStr }) => (
            <div key={`${month}/${id}`} className="bg-white border rounded-lg p-4 shadow-card">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-light">{dateStr}</div>
                  <div className="text-lg font-semibold text-gray-text">{data.titulo || 'Missão'}</div>
                  <div className="text-sm text-gray-text">{data.referencia || data.local || ''}</div>
                  <div className="text-xs text-gray-light">{timeStr}</div>
                </div>
                <WhatsappIcon
                  phone={phones[uid]}
                  text={`Voce foi escalado no dia ${dateStr}, confira suas escalas no link  https://abonoextra.web.app/missoesPessoal`}
                  onSent={() => {
                    const statusRef = ref(db, `/userEscalas/${uid}/${month}/${id}/status`);
                    update(statusRef, { whatsSent: true }).catch(() => {});
                  }}
                />
              </div>
              <button
                className="mt-3 px-3 py-2 border rounded text-sm"
                onClick={() => openAckMessage(month, id, dateStr)}
              >
                Dar ciente via WhatsApp
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}