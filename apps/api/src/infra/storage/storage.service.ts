import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { extname, isAbsolute, join } from 'node:path';

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

  /** Salva o buffer e retorna o nome do arquivo gerado. */
  async save(buffer: Buffer, originalName: string): Promise<string> {
    const ext = extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
    const filename = `${randomBytes(16).toString('hex')}${ext}`;
    await writeFile(join(this.dir, filename), buffer);
    return filename;
  }

  /** Caminho público (servido por /uploads). */
  publicPath(filename: string): string {
    return `/uploads/${filename}`;
  }
}
