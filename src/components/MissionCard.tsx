import React, { useMemo, useState, useEffect } from 'react';
import { ToggleSwitch } from './ToggleSwitch';

export interface Mission {
  id: string;
  titulo: string;
  local: string;
  data: string;
  horario: string;
  tipo: string;
  inscrito?: boolean;
  disponivel?: boolean;
  referencia?: string;
  inscritoStatus?: 'voluntario' | 'escalado' | string;
  descricao?: string;
  turnos?: any;
}

interface MissionCardProps {
  mission: Mission;
  onToggle?: (missionId: string, isEnrolled: boolean) => Promise<void> | void;
  hideToggle?: boolean;
  children?: React.ReactNode;
  statusBadge?: React.ReactNode;
}

export const MissionCard: React.FC<MissionCardProps> = ({ mission, onToggle, hideToggle = false, children, statusBadge }) => {
  const [isEnrolled, setIsEnrolled] = useState(mission.inscrito || false);
  const [sending, setSending] = useState(false);

  const [inicio, fim] = useMemo(() => {
    const parts = (mission.horario || '').split('-');
    const start = parts[0]?.trim() || '';
    const end = parts[1]?.trim() || '';
    return [start, end];
  }, [mission.horario]);

  // Status textual removido conforme solicitação

  const handleToggle = () => {
    const newState = !isEnrolled;
    setIsEnrolled(newState);
    if (onToggle) {
      const ret = onToggle(mission.id, newState);
      if (ret && typeof (ret as any).then === 'function') {
        setSending(true);
        (ret as Promise<void>).finally(() => setTimeout(() => setSending(false), 400));
      } else {
        setSending(true);
        setTimeout(() => setSending(false), 400);
      }
    }
  };

  useEffect(() => {
    setIsEnrolled(!!mission.inscrito);
  }, [mission.id, mission.inscrito]);

  return (
    <div className={`rounded-lg shadow-card p-4 mb-3 ${mission.inscritoStatus === 'escalado' ? 'bg-success-light' : 'bg-surface'}`}>
      <div className="flex items-center">
        {/* Coluna de horário à esquerda */}
        <div className="w-16 mr-4 flex flex-col items-start">
          <span className="text-xl font-semibold text-gray-text leading-tight">{inicio}</span>
          {fim && <span className="text-xs text-gray-light">{fim}</span>}
        </div>

        {/* Conteúdo da missão */}
        <div className="flex-1">
          <h3 className="text-mission-title text-gray-text font-semibold mb-1">
            {mission.titulo}
          </h3>
          <p className="text-mission-subtitle text-gray-light mb-1">
            {mission.referencia ?? mission.local}
          </p>
          {statusBadge}
          {/* Parágrafo de status removido */}
        </div>

        {/* Botão de inscrição alinhado verticalmente ao centro do cartão */}
        {!hideToggle && (
          <div className="ml-4 flex flex-col items-center">
            <ToggleSwitch
              isOn={isEnrolled}
              onToggle={handleToggle}
              disabled={!mission.disponivel}
              size="md"
            />
            <div className="mt-1 text-xs text-center">
              {sending ? (
                <span className="text-secondary">enviando...</span>
              ) : isEnrolled ? (
                <span className="text-success">voluntário</span>
              ) : null}
            </div>
          </div>
        )}
      </div>
      {children}
    </div>
  );
};
