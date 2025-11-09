import React, { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { auth, db } from '../services/firebase';
import Header from '../components/Header';
import { WeeklyCalendar } from '../components/WeeklyCalendar';
import UnitMissions from '../components/UnitMissions';

type UnitMeta = { titulo: string; descricao?: string; cidade?: string };

export const Home: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [userUnits, setUserUnits] = useState<Record<string, UnitMeta>>({});
  const [loadingUnits, setLoadingUnits] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const r = ref(db, `/users/${uid}/units`);
    setLoadingUnits(true);
    const unsub = onValue(r, (snap) => {
      const val = snap.val() || {};
      setUserUnits(val);
      setLoadingUnits(false);
    });
    return () => unsub();
  }, []);

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px]">
      <Header date={selectedDate} />
      <WeeklyCalendar selectedDate={selectedDate} onDateSelect={handleDateSelect} />
      <div className="px-4 py-4">
        {loadingUnits ? (
          <div className="bg-surface rounded-lg shadow-card p-4 mb-3 animate-pulse">
            <div className="h-4 bg-gray-200 rounded mb-2"></div>
            <div className="h-3 bg-gray-200 rounded mb-1"></div>
            <div className="h-3 bg-gray-200 rounded"></div>
          </div>
        ) : (
          <div>
            {Object.keys(userUnits).length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-light">Nenhuma unidade cadastrada.</p>
                <p className="text-gray-light">Adicione em Unidades para ver missões.</p>
              </div>
            )}
            {Object.entries(userUnits).map(([code, meta]) => (
              <UnitMissions key={code} unitCode={code} unitMeta={meta} selectedDate={selectedDate} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};