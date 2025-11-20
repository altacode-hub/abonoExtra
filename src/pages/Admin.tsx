import { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { ref, set, push, onValue, remove } from 'firebase/database';
import type { Mission } from '../components/MissionCard';

export default function Admin() {
  const [missoes, setMissoes] = useState<Record<string, Mission>>({});
  const [titulo, setTitulo] = useState('');

  useEffect(() => {
    const r = ref(db, '/missoes');
    const unsub = onValue(r, (snap) => setMissoes(snap.val() || {}));
    return () => unsub();
  }, []);

  async function createMission() {
    const idRef = push(ref(db, '/missoes'));
    await set(idRef, {
      titulo,
      descricao: 'Descrição da missão',
      local: 'Base X',
      tipo: 'Patrulha',
      turnos: {},
      requisitos: 'Documento válido',
      createdBy: 'admin',
      createdAt: Date.now(),
    });
    setTitulo('');
  }

  async function removeMission(id: string) {
    await remove(ref(db, `/missoes/${id}`));
  }

  return (
    <section>
      <h2 className="text-xl font-semibold">Painel Admin</h2>
      <div className="mt-3 flex gap-2">
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título" className="border rounded px-3 py-2" />
        <button onClick={createMission} className="px-3 py-2 bg-primary text-white rounded">Criar missão</button>
      </div>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.keys(missoes).map((id) => (
          <div key={id} className="border rounded p-3">
            <div className="font-medium">{missoes[id].titulo}</div>
            <div className="flex gap-2 mt-2">
              <button className="px-2 py-1 bg-gray-200 rounded">Editar</button>
              <button onClick={() => removeMission(id)} className="px-2 py-1 bg-red-600 text-white rounded">Excluir</button>
              <button className="px-2 py-1 bg-gray-200 rounded">Exportar CSV</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}