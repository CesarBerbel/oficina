/**
 * Restaura um backup lógico gerado pela página de backup do super admin
 * (apps/api/src/modules/backup). O arquivo é um .zip com `database.ndjson`
 * (todas as tabelas) e a pasta `uploads/`.
 *
 * ATENÇÃO: a restauração APAGA os dados atuais (TRUNCATE) e os substitui pelos
 * do backup. Use num banco já migrado (mesma versão do schema):
 *
 *   1) pnpm --filter @oficina/api prisma:deploy   # garante o schema
 *   2) pnpm --filter @oficina/api restore-backup ./oficina_backup_*.zip --yes
 *
 * As FKs são desabilitadas durante a carga via `session_replication_role` quando
 * o usuário do banco tem privilégio (o dono/superusuário tem). Sem isso, a ordem
 * de tabelas do manifesto (pais antes dos filhos) é respeitada na inserção.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import AdmZip from 'adm-zip';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { decodeValue, type BackupMeta } from '../modules/backup/backup-codec';

const prisma = new PrismaClient();

/** Forma mínima de um delegate do Prisma usada na restauração. */
type CreateManyDelegate = {
  createMany: (args: { data: Record<string, unknown>[] }) => Promise<unknown>;
};

/** Mapa nome-de-tabela → delegate do Prisma (ex.: "service_orders" → serviceOrder). */
function buildTableToDelegate(): Map<string, string> {
  const map = new Map<string, string>();
  for (const model of Prisma.dmmf.datamodel.models) {
    const delegate = model.name.charAt(0).toLowerCase() + model.name.slice(1);
    map.set(model.dbName ?? model.name, delegate);
  }
  return map;
}

function uploadsDir(): string {
  const configured = process.env.STORAGE_LOCAL_DIR ?? './uploads';
  return isAbsolute(configured) ? configured : join(process.cwd(), configured);
}

async function main(): Promise<void> {
  const file = process.argv[2];
  const confirmed = process.argv.includes('--yes') || process.env.RESTORE_CONFIRM === 'true';
  if (!file) {
    console.error('Uso: restore-backup <arquivo.zip> [--yes]');
    process.exit(1);
  }
  if (!confirmed) {
    console.error(
      'Recusado: a restauração APAGA os dados atuais. Reexecute com --yes para confirmar.',
    );
    process.exit(1);
  }

  const zip = new AdmZip(isAbsolute(file) ? file : join(process.cwd(), file));
  const dbEntry = zip.getEntry('database.ndjson');
  if (!dbEntry) {
    console.error('Backup inválido: database.ndjson não encontrado no .zip.');
    process.exit(1);
  }

  const lines = zip.readAsText(dbEntry).split('\n').filter(Boolean);
  const header = JSON.parse(lines[0]) as { _meta?: BackupMeta };
  const meta = header._meta;
  if (!meta || meta.format !== 'oficina-logical-backup') {
    console.error('Backup inválido: cabeçalho _meta ausente ou desconhecido.');
    process.exit(1);
  }

  // Agrupa as linhas por tabela, preservando a ordem de restauração do manifesto.
  const rowsByTable = new Map<string, Record<string, unknown>[]>(meta.tables.map((t) => [t, []]));
  for (let i = 1; i < lines.length; i++) {
    const { t, r } = JSON.parse(lines[i]) as { t: string; r: Record<string, unknown> };
    const decoded = decodeValue(r) as Record<string, unknown>;
    (rowsByTable.get(t) ?? rowsByTable.set(t, []).get(t)!).push(decoded);
  }

  const tableToDelegate = buildTableToDelegate();

  console.log(`Restaurando backup de ${meta.createdAt} (app ${meta.appVersion})...`);

  await prisma.$transaction(
    async (tx) => {
      // Desabilita as FKs durante a carga (best-effort: requer privilégio).
      let fksOff = false;
      try {
        await tx.$executeRawUnsafe('SET session_replication_role = replica');
        fksOff = true;
      } catch {
        console.warn('Aviso: sem privilégio para desabilitar FKs; usando a ordem do manifesto.');
      }

      // Limpa tudo antes de inserir.
      const quoted = meta.tables.map((t) => `"${t}"`).join(', ');
      await tx.$executeRawUnsafe(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`);

      for (const table of meta.tables) {
        const rows = rowsByTable.get(table) ?? [];
        if (rows.length === 0) continue;

        const delegate = tableToDelegate.get(table);
        const client = tx as unknown as Record<string, CreateManyDelegate | undefined>;
        const del = delegate ? client[delegate] : undefined;
        if (del && typeof del.createMany === 'function') {
          // Caminho normal: createMany trata Date/Decimal/Buffer/Json nativamente.
          const colCount = Object.keys(rows[0]).length || 1;
          const chunkSize = Math.max(1, Math.floor(60000 / colCount));
          for (let i = 0; i < rows.length; i += chunkSize) {
            await del.createMany({ data: rows.slice(i, i + chunkSize) });
          }
        } else {
          // Tabela sem model Prisma (ex.: junção implícita _X): insere via raw.
          for (const row of rows) {
            const cols = Object.keys(row);
            const colSql = cols.map((c) => `"${c}"`).join(', ');
            const params = cols.map((_, i) => `$${i + 1}`).join(', ');
            await tx.$executeRawUnsafe(
              `INSERT INTO "${table}" (${colSql}) VALUES (${params})`,
              ...cols.map((c) => row[c]),
            );
          }
        }
        console.log(`  ${table}: ${rows.length} linha(s).`);
      }

      if (fksOff) {
        await tx.$executeRawUnsafe('SET session_replication_role = DEFAULT');
      }
    },
    { timeout: 60 * 60 * 1000, maxWait: 30_000 },
  );

  // Restaura os uploads.
  const dir = uploadsDir();
  let uploadCount = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !entry.entryName.startsWith('uploads/')) continue;
    const rel = entry.entryName.slice('uploads/'.length);
    if (!rel) continue;
    const dest = join(dir, rel);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, entry.getData());
    uploadCount += 1;
  }
  console.log(`Uploads restaurados: ${uploadCount} arquivo(s).`);

  console.log('✔ Restauração concluída.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
