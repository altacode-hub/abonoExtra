/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cores baseadas na imagem fornecida
        primary: '#006E90', // Azul do header conforme solicitado
        'primary-dark': '#005a74',
        secondary: '#64748b',
        accent: '#f97316', // Laranja do calendário ativo
        'accent-light': '#fed7aa',
        surface: '#ffffff',
        'surface-muted': '#f8fafc',
        'surface-gray': '#f1f5f9',
        success: '#10b981', // Verde dos toggles ativos
        'success-light': '#d1fae5',
        warning: '#f59e0b',
        error: '#ef4444',
        // Tons de cinza específicos
        'gray-text': '#374151',
        'gray-light': '#9ca3af',
        'gray-border': '#e5e7eb',
        'toggle-inactive': '#d1d5db',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'header-date': ['18px', { lineHeight: '24px', fontWeight: '600' }],
        'calendar-day': ['14px', { lineHeight: '20px', fontWeight: '500' }],
        'mission-title': ['16px', { lineHeight: '24px', fontWeight: '600' }],
        'mission-subtitle': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'time-label': ['12px', { lineHeight: '16px', fontWeight: '500' }],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        'card-hover': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'calendar': '0 2px 4px 0 rgba(0, 0, 0, 0.1)',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      borderRadius: {
        'calendar': '8px',
        'toggle': '12px',
      },
    },
  },
  plugins: [],
}