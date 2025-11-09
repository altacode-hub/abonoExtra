import { useEffect, useMemo, useState } from 'react';
import CalendarIcon from '../../assets/icons/Calendar';

type Props = {
  items: { id: string; tipo: string; local: string; turnos: Record<string, any> }[];
  onFilter: (f: { date?: string; tipo?: string; turno?: 'manha' | 'tarde' | 'noite' | 'todos'; search?: string }) => void;
};

export default function FilterBar({ items, onFilter }: Props) {
  const [date, setDate] = useState<string>('');
  const [tipo, setTipo] = useState<string>('');
  const [turno, setTurno] = useState<'todos' | 'manha' | 'tarde' | 'noite'>('todos');
  const [search, setSearch] = useState<string>('');

  const tipos = useMemo(() => Array.from(new Set(items.map((i) => i.tipo).filter(Boolean))), [items]);

  useEffect(() => {
    onFilter({ date: date || undefined, tipo: tipo || undefined, turno, search: search || undefined });
  }, [date, tipo, turno, search, onFilter]);

  return (
    <div className="bg-surface-muted rounded-lg p-3 md:p-4 border">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4 items-end">
        <label className="flex flex-col gap-1">
          <span className="text-secondary text-sm">Data</span>
          <div className="flex items-center gap-2 bg-white border rounded px-3 py-2">
            <CalendarIcon />
            <input type="date" className="flex-1 outline-none" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-secondary text-sm">Tipo</span>
          <select className="bg-white border rounded px-3 py-2" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-secondary text-sm">Turno</span>
          <select className="bg-white border rounded px-3 py-2" value={turno} onChange={(e) => setTurno(e.target.value as any)}>
            <option value="todos">Todos</option>
            <option value="manha">Manhã</option>
            <option value="tarde">Tarde</option>
            <option value="noite">Noite</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-secondary text-sm">Busca</span>
          <input className="bg-white border rounded px-3 py-2" placeholder="Título ou local" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>
    </div>
  );
}