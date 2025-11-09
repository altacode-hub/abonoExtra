type DaySlot = {
  date: string; // ISO
  shifts: { id: string; label: string; available: boolean }[];
};

export default function CalendarSelector({ days, onToggle }: { days: DaySlot[]; onToggle: (day: string, shiftId: string, checked: boolean) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" role="group" aria-label="Seletor de dias e turnos">
      {days.map((d) => (
        <div key={d.date} className="border rounded p-3">
          <div className="font-medium mb-2">{new Date(d.date).toLocaleDateString('pt-BR')}</div>
          <div className="flex flex-col gap-2">
            {d.shifts.map((s) => (
              <label key={s.id} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!s.available}
                  onChange={(e) => onToggle(d.date, s.id, e.target.checked)}
                  aria-checked={!s.available ? undefined : undefined}
                />
                <span className={s.available ? '' : 'text-gray-400'}>{s.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}