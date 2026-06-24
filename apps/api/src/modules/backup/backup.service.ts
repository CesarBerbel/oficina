import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Archiver } from 'archiver';
import { existsSync, statSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { BackupStatusDto } from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { encodeValue, type BackupMeta } from './backup-codec';

/** Tempo máximo (ms) que a transação de leitura do dump pode durar. */
const DUMP_TX_TIMEOUT_MS = 30 * 60 * 1000;
/** Linhas lidas por página em cada tabela (mantém a memória limitada). */
const PAGE_SIZE = 1000;

/** Escreve no stream respeitando backpressure (aguarda 'drain' quão preciso). */
function writeChunk(stream: PassThrough, chunk: string): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(chunk, (err) => (err ? reject(err) : undefined));
    if (!stream.writableNeedDrain) resolve();
    else stream.once('drain', resolve);
  });
}

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
    const [tables, uploads] = await Promise.all([this.tablesInRestoreOrder(), this.uploadsStats()]);

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

  /** Nome do arquivo de backup (carimbado pela hora atual). */
  filename(now: Date = new Date()): string {
    return `oficina_backup_${this.stamp(now)}.zip`;
  }

  /**
   * Gera o backup lógico e o escreve no `archive` (zip) já conectado à resposta:
   * `database.ndjson` (todas as tabelas), `manifest.json` e a pasta `uploads/`.
   *
   * Streaming de ponta a ponta para manter a memória limitada: cada tabela é
   * lida por páginas (keyset via `ctid`) dentro de uma transação RepeatableRead
   * (snapshot consistente), e as linhas são escritas no zip à medida que chegam.
   * Os uploads são adicionados direto do disco. Nada é materializado inteiro.
   */
  async streamTo(archive: Archiver): Promise<void> {
    const order = await this.tablesInRestoreOrder();
    const now = new Date();
    const counts: Record<string, number> = {};

    // `database.ndjson` é alimentado por um PassThrough enquanto lemos o banco.
    const db = new PassThrough();
    archive.append(db, { name: 'database.ndjson' });

    const meta: BackupMeta = {
      format: 'oficina-logical-backup',
      version: 1,
      createdAt: now.toISOString(),
      appVersion: process.env.APP_VERSION ?? 'unknown',
      tables: order,
    };
    await writeChunk(db, JSON.stringify({ _meta: meta }) + '\n');

    try {
      await this.prisma.$transaction(
        async (tx) => {
          for (const table of order) {
            if (!/^[A-Za-z0-9_]+$/.test(table)) continue; // defesa: nome vem do catálogo
            let cursor = '(0,0)';
            let n = 0;
            for (;;) {
              // `ctid` é o id físico da linha: existe em qualquer tabela (mesmo
              // sem PK) e é ordenável — keyset estável dentro do snapshot. Volta
              // como texto (Prisma não desserializa o tipo `tid`), mas a ordenação
              // e o cursor usam o `tid` real (t.ctid) para a ordem ser correta.
              const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
                `SELECT t.ctid::text AS ctid, t.* FROM "${table}" t ` +
                  `WHERE t.ctid > $1::tid ORDER BY t.ctid LIMIT $2`,
                cursor,
                PAGE_SIZE,
              );
              if (rows.length === 0) break;
              for (const row of rows) {
                cursor = String(row.ctid);
                delete row.ctid; // pseudo-coluna, não faz parte do dump
                await writeChunk(db, JSON.stringify({ t: table, r: encodeValue(row) }) + '\n');
                n += 1;
              }
              if (rows.length < PAGE_SIZE) break;
            }
            counts[table] = n;
          }
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          timeout: DUMP_TX_TIMEOUT_MS,
        },
      );
      db.end();
    } catch (err) {
      db.destroy(err as Error);
      throw err;
    }

    // Manifesto (com as contagens, só para conferência) e uploads do disco.
    archive.append(Buffer.from(JSON.stringify({ ...meta, counts }, null, 2), 'utf8'), {
      name: 'manifest.json',
    });
    const dir = this.uploadsDir();
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      archive.directory(dir, 'uploads');
    }

    const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
    this.logger.log(`Backup gerado: ${order.length} tabelas, ${totalRows} linhas.`);

    await archive.finalize();
  }
}
