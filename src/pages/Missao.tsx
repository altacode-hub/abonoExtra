import { useEffect, useMemo, useState } from 'react';
import { onValue, ref, push, set } from 'firebase/database';
import { auth, db } from '../services/firebase';
import PageHeader from '../components/PageHeader';
import { useNavigate, useSearchParams } from 'react-router-dom';

type UnitMeta = { titulo: string; descricao?: string; cidade?: string };

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

export default function Missao() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [adminUnits, setAdminUnits] = useState<Record<string, UnitMeta>>({});
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [templates, setTemplates] = useState<Record<string, MissionTemplate>>({});

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    // Unidades em que o usuário é admin
    const rAdmin = ref(db, `/roles/${uid}/unitAdmin`);
    const unsubAdmin = onValue(rAdmin, (snap) => {
      const unitsMap: Record<string, boolean> = snap.val() || {};
      const codes = Object.keys(unitsMap);
      if (codes.length === 0) {
        setAdminUnits({});
        setSelectedUnit('');
        return;
      }
      // Carrega metadados das unidades
      const updates: Record<string, UnitMeta> = {};
      let pending = codes.length;
      codes.forEach((code) => {
        const rMeta = ref(db, `/users/${uid}/units/${code}`);
        onValue(rMeta, (metaSnap) => {
          updates[code] = metaSnap.val() || { titulo: code };
          pending -= 1;
          if (pending === 0) {
            setAdminUnits(updates);
            const initial = params.get('unit') || codes[0];
            setSelectedUnit(initial);
          }
        }, { onlyOnce: true });
      });
    });
    return () => {
      unsubAdmin();
    };
  }, [params]);

  useEffect(() => {
    if (!selectedUnit) {
      setTemplates({});
      return;
    }
    const r = ref(db, `/units/${selectedUnit}/missionTemplates`);
    const unsub = onValue(r, (snap) => setTemplates(snap.val() || {}));
    return () => unsub();
  }, [selectedUnit]);

  const handleCreate = () => {
    if (!selectedUnit) return;
    navigate(`/missao/nova?unit=${selectedUnit}`);
  };

  return (
    <div className="min-h-screen bg-surface-gray pt-[68px]">
      <PageHeader title="Missão" />
      <div className="px-4 py-4 pb-24">
        <div className="bg-white border rounded-lg p-4 shadow-card mb-3">
          <h2 className="text-lg font-semibold text-gray-text mb-2">Missões da Unidade</h2>
          {Object.keys(adminUnits).length > 0 ? (
            <label className="flex flex-col gap-1">
              <span className="text-secondary text-sm">Selecionar unidade</span>
              <select
                className="bg-white border rounded px-3 py-2"
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
              >
                {Object.entries(adminUnits).map(([code, meta]) => (
                  <option key={code} value={code}>{meta.titulo || code}</option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm text-gray-light">Você não é admin de nenhuma unidade.</p>
          )}
        </div>

        <div className="bg-white border rounded-lg p-4 shadow-card">
          <h3 className="text-md font-medium text-gray-text mb-2">Modelos de Missão</h3>
          {Object.keys(templates).length === 0 ? (
            <p className="text-sm text-gray-light">Nenhum modelo cadastrado.</p>
          ) : (
            <ul className="divide-y">
              {Object.entries(templates).map(([id, t]) => (
                <li key={id} className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-text">{t.titulo}</div>
                      <div className="text-sm text-gray-light">{t.inicio} - {t.fim} • {t.referencias?.length || 0} referências</div>
                    </div>
                    <button className="text-sm text-secondary hover:underline" onClick={() => navigate(`/missao/nova?unit=${selectedUnit}&edit=${id}`)}>Editar</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Botão flutuante + */}
        {selectedUnit && (
          <button
            className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-primary text-white shadow-card flex items-center justify-center text-2xl"
            aria-label="Nova missão"
            onClick={handleCreate}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}