import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import CalendarSelector from '../components/CalendarSelector';
import type { Missao } from '../components/MissionCard';
import { db } from '../services/firebase';
import { onValue, ref } from 'firebase/database';
import { strings } from '../i18n/strings';

export default function Mission() {
  const { id } = useParams<{ id: string }>();
  const [missao, setMissao] = useState<Missao | null>(null);

  useEffect(() => {
    if (!id) return;
    const r = ref(db, `/missoes/${id}`);
    const unsub = onValue(r, (snap) => {
      const val = snap.val();
      setMissao(val ? { id, ...val } : null);
    });
    return () => unsub();
  }, [id]);

  const days = useMemo(() => {
    if (!missao) return [] as { date: string; shifts: { id: string; label: string; available: boolean }[] }[];
    return Object.values(missao.turnos || {}).reduce((acc: any[], t: any) => {
      const existing = acc.find((d) => d.date === t.data);
      const label = `${t.inicio}-${t.fim} (${t.vagasDisponiveis}/${t.vagasTotais})`;
      const item = { id: t.turnoId, label, available: t.vagasDisponiveis > 0 };
      if (existing) existing.shifts.push(item);
      else acc.push({ date: t.data, shifts: [item] });
      return acc;
    }, []);
  }, [missao]);

  function onToggle(day: string, shiftId: string, checked: boolean) {
    // Placeholder: integração com Cloud Function onInscricaoRequest via callable
    console.log('toggle', { day, shiftId, checked });
  }

  if (!missao) return <div>Carregando…</div>;

  return (
    <section>
      <h2 className="text-xl font-semibold">{strings.mission.details}</h2>
      <p className="text-gray-700">{missao.descricao}</p>
      <div className="mt-4">
        <h3 className="font-medium mb-2">{strings.mission.selectDays}</h3>
        <CalendarSelector days={days} onToggle={onToggle} />
      </div>
    </section>
  );
}