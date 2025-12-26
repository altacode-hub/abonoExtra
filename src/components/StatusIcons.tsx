import React from 'react';

export const StatusWhatsNotSent: React.FC<{ title?: string }> = ({ title }) => (
  <div className="w-6 h-6 flex items-center justify-center" title={title || 'WhatsApp não enviado'} aria-label="WhatsApp não enviado">
    <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-400" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M7 7l10 10M17 7L7 17" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  </div>
);

export const StatusWhatsSent: React.FC<{ title?: string }> = ({ title }) => (
  <div className="w-6 h-6 flex items-center justify-center" title={title || 'WhatsApp enviado'} aria-label="WhatsApp enviado">
    <svg viewBox="0 0 24 24" className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="10" strokeWidth="1.6" />
      <path d="M7.5 12.5l3 3 6-7" strokeWidth="2" strokeLinecap="round" />
    </svg>
  </div>
);

export const StatusAckGiven: React.FC<{ title?: string }> = ({ title }) => (
  <div className="w-6 h-6 flex items-center justify-center" title={title || 'Efetivo deu ciente'} aria-label="Efetivo deu ciente">
    <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="10" strokeWidth="1.6" />
      <path d="M6.8 12.8l2.6 2.6 5.6-6.2" strokeWidth="2" strokeLinecap="round" />
      <path d="M8.8 14.8l2.6 2.6 5.6-6.2" strokeWidth="2" strokeLinecap="round" />
    </svg>
  </div>
);