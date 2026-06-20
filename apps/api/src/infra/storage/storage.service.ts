import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { isAbsolute, join } from 'node:path';

/**
 * Armazenamento de arquivos. Em dev usa disco local; a interface permite
 * trocar por S3/R2 no futuro sem mudar os consumidores.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly dir: string;

  constructor(config: ConfigService) {
    const configured = config.get<string>('STORAGE_LOCAL_DIR') ?? './uploads';
    this.dir = isAbsolute(configured) ? configured : join(process.cwd(), configured);
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.dir, { recursive: true }).catch(() => undefined);
  }

  /** Salva o buffer com extensão já validada e retorna o nome gerado. */
  async save(buffer: Buffer, extension: string): Promise<string> {
    const ext = extension.toLowerCase();
    if (!/^\.[a-z0-9]+$/.test(ext)) {
      throw new Error('Extensão de arquivo inválida');
    }
    const filename = `${randomBytes(16).toString('hex')}${ext}`;
    await writeFile(join(this.dir, filename), buffer);
    return filename;
  }

  /** Remove um arquivo salvo localmente. Usado para compensar falha de banco/quota após o upload. */
  async delete(filename: string): Promise<void> {
    if (!/^[a-f0-9]{32}\.[a-z0-9]+$/i.test(filename)) {
      throw new Error('Nome de arquivo inválido');
    }
    await unlink(join(this.dir, filename)).catch(() => undefined);
  }

  /** Caminho público (servido por /uploads). */
  publicPath(filename: string): string {
    return `/uploads/${filename}`;
  }
}
