/** Eventos da OS que podem disparar mensagens automáticas. */
export const MessageEvent = {
  OS_OPENED: 'OS_OPENED',
  DIAGNOSIS_READY: 'DIAGNOSIS_READY',
  QUOTE_SENT: 'QUOTE_SENT',
  QUOTE_APPROVED: 'QUOTE_APPROVED',
  OS_IN_EXECUTION: 'OS_IN_EXECUTION',
  OS_READY: 'OS_READY',
  CUSTOMER_NOTIFIED: 'CUSTOMER_NOTIFIED',
  VEHICLE_DELIVERED: 'VEHICLE_DELIVERED',
  CUSTOMER_BIRTHDAY: 'CUSTOMER_BIRTHDAY',
  MANUAL: 'MANUAL',
} as const;

export type MessageEvent = (typeof MessageEvent)[keyof typeof MessageEvent];

export const MESSAGE_EVENT_LABELS: Record<MessageEvent, string> = {
  OS_OPENED: 'OS aberta',
  DIAGNOSIS_READY: 'Diagnóstico pronto',
  QUOTE_SENT: 'Orçamento enviado',
  QUOTE_APPROVED: 'Orçamento aprovado',
  OS_IN_EXECUTION: 'OS em execução',
  OS_READY: 'OS pronta',
  CUSTOMER_NOTIFIED: 'Cliente avisado',
  VEHICLE_DELIVERED: 'Veículo entregue',
  CUSTOMER_BIRTHDAY: 'Aniversário do cliente',
  MANUAL: 'Manual',
};

export const MESSAGE_EVENTS = Object.values(MessageEvent) as MessageEvent[];

/** Canais de envio (no MVP: adapter mock/log). */
export const MessageChannel = {
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
  SMS: 'SMS',
} as const;

export type MessageChannel = (typeof MessageChannel)[keyof typeof MessageChannel];

export const MESSAGE_CHANNEL_LABELS: Record<MessageChannel, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  SMS: 'SMS',
};

export const MESSAGE_CHANNELS = Object.values(MessageChannel) as MessageChannel[];

export const MessageStatus = {
  SIMULADO: 'SIMULADO',
  ENVIADO: 'ENVIADO',
  FALHA: 'FALHA',
} as const;

export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  SIMULADO: 'Simulado',
  ENVIADO: 'Enviado',
  FALHA: 'Falha',
};

/** Variáveis disponíveis nos templates (para o editor). */
export const MESSAGE_VARIABLES: { token: string; description: string }[] = [
  { token: '{{cliente.nome}}', description: 'Nome do cliente' },
  { token: '{{cliente.telefone}}', description: 'Telefone do cliente' },
  { token: '{{os.numero}}', description: 'Número da OS' },
  { token: '{{os.status}}', description: 'Status da OS' },
  { token: '{{os.total}}', description: 'Total da OS' },
  { token: '{{os.link}}', description: 'Link de acompanhamento' },
  { token: '{{veiculo.placa}}', description: 'Placa do veículo' },
  { token: '{{veiculo.modelo}}', description: 'Modelo do veículo' },
  { token: '{{oficina.nome}}', description: 'Nome da oficina' },
];
