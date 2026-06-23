import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import AdmZip from 'adm-zip';
import { existsSync, statSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { BackupStatusDto } from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { encodeValue, type BackupMeta } from './backup-codec';

/** Tempo máximo (ms) que a transação de leitura do dump pode durar. */
const DUMP_TX_TIMEOUT_MS = 30 * 60 * 1000;

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Diretório local dos uploads (mesma resolução do StorageService). */
  private uploadsDir(): string {
    const configured = process.env.STORAGE_LOCAL_DIR ?? './uploads';
    return isAbsolute(configured) ? configured : join(process.cwd(), configured);
  }

  /** Carimbo de data/hora para nomear o arquivo (YYYYMMDD_HHMMSS, hora local). */
  private stamp(now: Date): string {
    const p = (n: number): string => String(n).padStart(2, '0');
    return (
      `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
      `_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
    );
  }

  /** Estatísticas (recursivas) do diretório de uploads. */
  private async uploadsStats(): Promise<{ fileCount: number; sizeBytes: number }> {
    const dir = this.uploadsDir();
    if (!existsSync(dir)) return { fileCount: 0, sizeBytes: 0 };
    let fileCount = 0;
    let sizeBytes = 0;
    const walk = async (current: string): Promise<void> => {
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(current, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          fileCount += 1;
          sizeBytes += (await stat(full)).size;
        }
      }
    };
    await walk(dir);
    return { fileCount, sizeBytes };
  }

  /**
   * Tabelas do schema `public` (exceto `_prisma_migrations`) ordenadas por
   * dependência de chave estrangeira — pais antes dos filhos — para a restauração
   * conseguir inserir respeitando as FKs. Auto-referências são ignoradas na
   * ordenação (resolvidas inserindo a tabela inteira num único statement).
   */
  private async tablesInRestoreOrder(): Promise<string[]> {
    const tableRows = await this.prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name
    `;
    const tables = tableRows.map((r) => r.table_name);

    const fkRows = await this.prisma.$queryRaw<{ child: string; parent: string }[]>`
      SELECT tc.table_name AS child, ccu.table_name AS parent
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.constraint_schema = tc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    `;

    // Kahn: aresta parent -> child (insere o pai primeiro). Ignora auto-loop.
    const known = new Set(tables);
    const dependsOn = new Map<string, Set<string>>(tables.map((t) => [t, new Set<string>()]));
    for (const { child, parent } of fkRows) {
      if (child === parent || !known.has(child) || !known.has(parent)) continue;
      dependsOn.get(child)!.add(parent);
    }

    const ordered: string[] = [];
    const placed = new Set<string>();
    // Itera em ordem alfabética estável; emite quando todas as deps já saíram.
    let progressed = true;
    while (ordered.length < tables.length && progressed) {
      progressed = false;
      for (const t of tables) {
        if (placed.has(t)) continue;
        const deps = dependsOn.get(t)!;
        if ([...deps].every((d) => placed.has(d))) {
          ordered.push(t);
          placed.add(t);
          progressed = true;
        }
      }
    }
    // Ciclo de FKs (raro): anexa o restante na ordem alfabética.
    if (ordered.length < tables.length) {
      for (const t of tables) if (!placed.has(t)) ordered.push(t);
    }
    return ordered;
  }

  /** Estado para a página de backup (não gera o arquivo). */
  async status(): Promise<BackupStatusDto> {
    const hb = await this.prisma.opsHeartbeat.findUnique({ where: { key: 'backup' } });
    const ageHours = hb ? (Date.now() - hb.at.getTime()) / 3_600_000 : null;
    const maxAgeHours = Number(process.env.BACKUP_MAX_AGE_HOURS ?? 26);

    const sizeRows = await this.prisma.$queryRaw<{ size: bigint }[]>`
      SELECT pg_database_size(current_database()) AS size
    `;
    const [tables, uploads] = await Promise.all([
      this.tablesInRestoreOrder(),
      this.uploadsStats(),
    ]);

    return {
      heartbeat: {
        lastAt: hb ? hb.at.toISOString() : null,
        ageHours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
        maxAgeHours,
        ok: ageHours != null && ageHours <= maxAgeHours,
      },
      dbSizeBytes: Number(sizeRows[0]?.size ?? 0n),
      tableCount: tables.length,
      uploads,
    };
  }

  /**
   * Gera o backup lógico completo: um `.zip` com `database.ndjson` (todas as
   * tabelas), `manifest.json` e a pasta `uploads/`. A leitura do banco roda numa
   * transação RepeatableRead para capturar um snapshot consistente.
   */
  async generate(): Promise<{ buffer: Buffer; filename: string }> {
    const order = await this.tablesInRestoreOrder();
    const counts: Record<string, number> = {};
    const chunks: string[] = [];

    await this.prisma.$transaction(
      async (tx) => {
        for (const table of order) {
          if (!/^[A-Za-z0-9_]+$/.test(table)) continue; // defesa: nome vem do catálogo
          const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
            `SELECT * FROM "${table}"`,
          );
          counts[table] = rows.length;
          for (const row of rows) {
            chunks.push(JSON.stringify({ t: table, r: encodeValue(row) }));
          }
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: DUMP_TX_TIMEOUT_MS },
    );

    const now = new Date();
    const meta: BackupMeta = {
      format: 'oficina-logical-backup',
      version: 1,
      createdAt: now.toISOString(),
      appVersion: process.env.APP_VERSION ?? 'unknown',
      tables: order,
      counts,
    };
    const ndjson = [JSON.stringify({ _meta: meta }), ...chunks].join('\n') + '\n';

    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(meta, null, 2), 'utf8'));
    zip.addFile('database.ndjson', Buffer.from(ndjson, 'utf8'));

    const dir = this.uploadsDir();
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      zip.addLocalFolder(dir, 'uploads');
    }

    const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
    this.logger.log(`Backup gerado: ${order.length} tabelas, ${totalRows} linhas.`);

    return { buffer: zip.toBuffer(), filename: `oficina_backup_${this.stamp(now)}.zip` };
  }
}
