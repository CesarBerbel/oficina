import { z } from 'zod';
import { MessageChannel, MessageEvent, MessageStatus } from '../enums/message.js';
import { paginationQuerySchema } from './common.js';

export const createTemplateSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(160),
  event: z.nativeEnum(MessageEvent).default(MessageEvent.MANUAL),
  channel: z.nativeEnum(MessageChannel).default(MessageChannel.WHATSAPP),
  body: z.string().trim().min(1, 'Informe o corpo da mensagem').max(4000),
  active: z.boolean().default(true),
  autoSend: z.boolean().default(false),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = createTemplateSchema.partial();
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

/** Envio manual: por template OU corpo livre, para um cliente/OS. */
export const sendMessageSchema = z.object({
  templateId: z.string().optional(),
  channel: z.nativeEnum(MessageChannel),
  customerId: z.string().optional(),
  serviceOrderId: z.string().optional(),
  to: z.string().trim().max(160).optional(),
  body: z.string().trim().min(1).max(4000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const listMessagesQuerySchema = paginationQuerySchema;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

/** Envio de e-mail de teste para validar a configuração SMTP. */
export const sendTestEmailSchema = z.object({
  to: z.string().trim().email('Informe um e-mail válido'),
});
export type SendTestEmailInput = z.infer<typeof sendTestEmailSchema>;

export interface SendTestEmailResult {
  /** ENVIADO (SMTP), SIMULADO (log) ou FALHA. */
  status: MessageStatus;
  /** Modo efetivo no momento do envio. */
  mode: 'smtp' | 'log';
  error: string | null;
}

/** Estado atual do canal de e-mail (para exibir no painel). */
export interface MailStatusDto {
  /** 'smtp' = envia de verdade; 'log' = simulado no terminal. */
  mode: 'smtp' | 'log';
  /** Remetente configurado, quando em SMTP. */
  from: string | null;
}

export interface MessageTemplateDto {
  id: string;
  name: string;
  event: MessageEvent;
  channel: MessageChannel;
  body: string;
  active: boolean;
  autoSend: boolean;
}

export interface MessageLogDto {
  id: string;
  channel: MessageChannel;
  event: MessageEvent;
  status: MessageStatus;
  to: string | null;
  body: string;
  error: string | null;
  customerName: string | null;
  createdAt: string;
}
