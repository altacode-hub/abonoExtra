import React from 'react';

interface ToggleSwitchProps {
  isOn: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ 
  isOn, 
  onToggle, 
  disabled = false,
  size = 'md'
}) => {
  const sizeClasses = {
    sm: {
      container: 'w-8 h-4',
      circle: 'w-3 h-3',
      translate: 'translate-x-4'
    },
    md: {
      container: 'w-10 h-5',
      circle: 'w-4 h-4',
      translate: 'translate-x-5'
    }
  };

  const currentSize = sizeClasses[size];

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`
        relative inline-flex items-center rounded-toggle transition-colors duration-200 ease-in-out
        ${currentSize.container}
        ${isOn 
          ? 'bg-success' 
          : 'bg-toggle-inactive'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        focus:outline-none focus:ring-2 focus:ring-success focus:ring-offset-2
      `}
    >
      <span
        className={`
          inline-block rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out
          ${currentSize.circle}
          ${isOn ? currentSize.translate : 'translate-x-0.5'}
        `}
      />
    </button>
  );
};