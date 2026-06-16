// Entrypoint da API para runtime distroless (sem shell).
// Aplica as migrations pendentes e então sobe o servidor Nest.
import { spawnSync } from 'node:child_process';

const migrate = spawnSync(
  process.execPath,
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
  { stdio: 'inherit' },
);

if (migrate.status !== 0) {
  process.exit(migrate.status ?? 1);
}

await import('./dist/main.js');
