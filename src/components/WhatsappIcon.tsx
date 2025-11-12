import React from 'react';

type Props = {
  phone?: string; // E.164 sem sinais: 55XXXXXXXXXX
  text: string;
  onSent?: () => void;
  disabled?: boolean;
};

// Exibe apenas o ícone do WhatsApp dentro de uma div clicável.
// Usa wa.me, abrindo nova aba. Se não houver phone, abre com somente o texto.
export default function WhatsappIcon({ phone, text, onSent, disabled }: Props) {
  const href = (() => {
    const msg = encodeURIComponent(text);
    const base = 'https://wa.me';
    if (phone && phone.trim().length > 0) return `${base}/${phone}?text=${msg}`;
    return `${base}/?text=${msg}`;
  })();

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    // abre em nova aba
    window.open(href, '_blank', 'noopener,noreferrer');
    onSent?.();
  };

  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-green-50'}`}
      title={disabled ? 'WhatsApp indisponível (sem telefone)' : 'Enviar mensagem via WhatsApp'}
      onClick={handleClick}
      aria-label="Enviar WhatsApp"
    >
      {/* Ícone WhatsApp simples */}
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-green-600" fill="currentColor" aria-hidden="true">
        <path d="M20.52 3.48A11.78 11.78 0 0 0 12 0C5.37 0 .01 5.36.01 11.99c0 2.11.56 4.17 1.63 5.98L0 24l6.17-1.61A11.96 11.96 0 0 0 12 24c6.63 0 11.99-5.36 11.99-11.99 0-3.21-1.25-6.23-3.47-8.53ZM12 21.82a9.8 9.8 0 0 1-5.02-1.38l-.36-.21-3.66.95.98-3.57-.24-.37A9.8 9.8 0 0 1 2.18 12C2.18 6.53 6.53 2.18 12 2.18s9.82 4.35 9.82 9.82S17.47 21.82 12 21.82Zm5.58-7.39c-.3-.16-1.77-.87-2.05-.97-.28-.1-.48-.16-.68.16-.2.32-.78.97-.95 1.16-.17.19-.35.22-.65.06-.3-.16-1.26-.46-2.4-1.47-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.14-.62.14-.14.3-.35.46-.52.15-.17.2-.29.3-.49.1-.2.05-.37-.02-.52-.07-.16-.68-1.64-.93-2.26-.24-.58-.5-.5-.68-.51l-.58-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.88 1.22 3.08c.15.2 2.12 3.24 5.13 4.42.72.28 1.29.45 1.73.58.73.23 1.39.2 1.92.12.59-.09 1.77-.72 2.02-1.42.25-.7.25-1.29.17-1.42-.08-.13-.27-.2-.57-.35Z" />
      </svg>
    </div>
  );
}