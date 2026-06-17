import { PrismaClient } from '@prisma/client';
import {
  seedMessageTemplates,
  BASE_MESSAGE_TEMPLATES,
} from '../src/modules/messaging/default-templates';

// Reexporta para o seed principal (prisma/seed.ts) usar a fonte única em src.
export { seedMessageTemplates, BASE_MESSAGE_TEMPLATES };

/** Execução standalone: semeia os templates para todos os tenants existentes. */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
    if (tenants.length === 0) {
      console.log('Nenhum tenant encontrado — rode o seed principal antes.');
      return;
    }
    for (const t of tenants) {
      const n = await seedMessageTemplates(prisma, t.id);
      console.log(`✔ ${t.name}: ${n} template(s) criado(s)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
