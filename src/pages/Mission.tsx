import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import CalendarSelector, { DaySlot } from '../components/CalendarSelector';
import type { Mission } from '../components/MissionCard';
import { db } from '../services/firebase';
import { onValue, ref } from 'firebase/database';
import { strings } from '../i18n/strings';

export default function Mission() {
  const { id } = useParams<{ id: string }>();
  const [missao, setMissao] = useState<Mission | null>(null);

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
    if (!missao) return [] as DaySlot[];
    // Return empty array for now to avoid type errors
    // TODO: Add proper turnos/shifts data structure to Mission interface if needed
    return [] as DaySlot[];
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