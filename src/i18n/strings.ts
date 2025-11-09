export const strings = {
  appTitle: 'Abono Extra',
  home: {
    title: 'Missões de serviço extras',
    subtitle: 'Escolha os dias que deseja trabalhar',
    filters: 'Filtros',
    type: 'Tipo',
    time: 'Horário',
    place: 'Local',
    today: 'Hoje',
    week: 'Semana'
  },
  auth: {
    login: 'Entrar',
    email: 'Email',
    password: 'Senha',
    logout: 'Sair',
    google: 'Entrar com Google'
  },
  mission: {
    details: 'Detalhes da missão',
    requirements: 'Requisitos',
    availableSlots: 'Vagas disponíveis',
    selectDays: 'Selecione dias/turnos',
    enroll: 'Inscrever-se',
    cancel: 'Cancelar inscrição'
  },
  admin: {
    panel: 'Painel Admin',
    create: 'Criar missão',
    edit: 'Editar missão',
    delete: 'Excluir missão',
    exportCSV: 'Exportar CSV',
    approveManual: 'Aprovação manual'
  },
  offline: {
    title: 'Você está offline',
    description: 'Algumas funções podem ficar indisponíveis até reconectar.'
  }
} as const;

export type Strings = typeof strings;