import React, { useEffect, useState } from 'react';

interface WeeklyCalendarProps {
  onDateSelect?: (date: Date) => void;
  selectedDate?: Date;
}

export const WeeklyCalendar: React.FC<WeeklyCalendarProps> = ({ onDateSelect, selectedDate }) => {
  const [internalSelectedDate, setInternalSelectedDate] = useState(new Date());

  const startOfWeek = (base: Date) => {
    const d = new Date(base);
    const day = d.getDay(); // 0=domingo
    const diffToMonday = day === 0 ? -6 : 1 - day; // ajustar para segunda
    d.setDate(d.getDate() + diffToMonday);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const initialWeekStart = startOfWeek(selectedDate ?? internalSelectedDate);
  const [weekStart, setWeekStart] = useState<Date>(initialWeekStart);

  // Sincroniza a semana exibida quando selectedDate muda externamente
  useEffect(() => {
    if (selectedDate) {
      setWeekStart(startOfWeek(selectedDate));
    }
  }, [selectedDate]);

  // Gerar os dias da semana baseada em weekStart
  const getWeekDays = () => {
    const weekDays = [] as Date[];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      weekDays.push(day);
    }
    return weekDays;
  };

  const weekDays = getWeekDays();
  const weekdayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  const handleDateClick = (date: Date) => {
    if (!selectedDate) {
      setInternalSelectedDate(date);
    }
    onDateSelect?.(date);
  };

  const prevWeek = () => {
    const newStart = new Date(weekStart);
    newStart.setDate(weekStart.getDate() - 7);
    setWeekStart(newStart);
  };

  const nextWeek = () => {
    const newStart = new Date(weekStart);
    newStart.setDate(weekStart.getDate() + 7);
    setWeekStart(newStart);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const effectiveSelectedDate = selectedDate ?? internalSelectedDate;

  const isSelected = (date: Date) => {
    return date.toDateString() === effectiveSelectedDate.toDateString();
  };

  return (
    <div className="bg-white px-4 py-3 border-b border-gray-border">
      <div className="flex justify-between items-center">
        {/* Botão semana anterior */}
        <button
          onClick={prevWeek}
          aria-label="Semana anterior"
          className="flex items-center justify-center w-8 h-12 rounded-calendar text-gray-text hover:bg-surface-gray"
        >
          ‹
        </button>
        {weekDays.map((date, index) => {
          const dayNumber = date.getDate();
          const isCurrentDay = isToday(date);
          const isSelectedDay = isSelected(date);
          
          return (
            <button
              key={index}
              onClick={() => handleDateClick(date)}
              className={`flex flex-col items-center justify-center w-10 h-12 rounded-calendar transition-all duration-200 ${
                isSelectedDay
                  ? 'bg-accent text-white shadow-calendar'
                  : 'text-gray-text hover:bg-surface-gray'
              } ${isCurrentDay ? 'border-b-2 border-primary' : ''}`}
            >
              <span className={`text-time-label mb-1 ${isSelectedDay ? 'text-white' : 'text-gray-light'}`}>
                {weekdayNames[index]}
              </span>
              <span className="text-calendar-day font-medium">
                {dayNumber}
              </span>
            </button>
          );
        })}
        {/* Botão próxima semana */}
        <button
          onClick={nextWeek}
          aria-label="Próxima semana"
          className="flex items-center justify-center w-8 h-12 rounded-calendar text-gray-text hover:bg-surface-gray"
        >
          ›
        </button>
      </div>
    </div>
  );
};