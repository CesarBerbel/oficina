import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export interface SendMailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendMailResult {
  ok: boolean;
  /** SMTP não configurado — o chamador deve tratar como simulado. */
  skipped: boolean;
  error: string | null;
}

/**
 * Envio de e-mail por SMTP (ex.: Hostinger). Se as variáveis SMTP não estiverem
 * configuradas, fica desabilitado e os e-mails são apenas logados (simulados).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const driver = config.get<string>('MAIL_DRIVER') ?? 'smtp';
    const host = config.get<string>('SMTP_HOST');
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');

    if (driver === 'log') {
      this.transporter = null;
      this.from = '';
      this.logger.log('MAIL_DRIVER=log — e-mails serão simulados no terminal.');
    } else if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: config.get<number>('SMTP_PORT') ?? 465,
        secure: config.get<boolean>('SMTP_SECURE') ?? true,
        auth: { user, pass },
      });
      this.from = config.get<string>('SMTP_FROM') || user;
      this.logger.log(`SMTP habilitado (${host}) como ${this.from}`);
    } else {
      this.transporter = null;
      this.from = '';
      this.logger.warn(
        'MAIL_DRIVER=smtp mas SMTP_HOST/USER/PASS ausentes — e-mails serão simulados.',
      );
    }
  }

  /** true = envia por SMTP; false = simulado (log no terminal). */
  get enabled(): boolean {
    return this.transporter !== null;
  }

  get mode(): 'smtp' | 'log' {
    return this.transporter !== null ? 'smtp' : 'log';
  }

  /** Remetente configurado (quando em modo SMTP). */
  get fromAddress(): string | null {
    return this.from || null;
  }

  async send(params: SendMailParams): Promise<SendMailResult> {
    if (!this.transporter) {
      return { ok: false, skipped: true, error: null };
    }
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
      });
      return { ok: true, skipped: false, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Falha ao enviar e-mail para ${params.to}: ${message}`);
      return { ok: false, skipped: false, error: message };
    }
  }
}
