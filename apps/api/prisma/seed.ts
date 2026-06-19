import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { seedMessageTemplates } from './seed-templates';
import { seedDefaultCategories } from '../src/modules/categories/default-categories';

/**
 * Fixture de DESENVOLVIMENTO / CI — NÃO roda em produção.
 *
 * O entrypoint de produção (docker/api-entrypoint.mjs) só aplica migrations; o
 * banco de produção começa VAZIO e o super admin é criado por comando
 * (src/scripts/create-superadmin.ts). Este seed existe apenas para dar uma
 * oficina + admin prontos no dev e nos testes E2E de frontend.
 */
const prisma = new PrismaClient();

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main(): Promise<void> {
  const tenantName = process.env.SEED_TENANT_NAME ?? 'Oficina Modelo';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@oficina.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';
  const slug = slugify(process.env.SEED_TENANT_SLUG ?? tenantName);

  const account = await prisma.account.upsert({
    where: { slug },
    update: {},
    create: { name: tenantName, slug, status: 'ACTIVE' },
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: { accountId: account.id },
    create: { name: tenantName, slug, accountId: account.id },
  });

  const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });

  // Admin da OFICINA (não é super admin — o super admin da plataforma é criado
  // separadamente pelo comando create-superadmin).
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    update: { passwordHash, role: Role.ADMIN, active: true, superAdmin: false },
    create: {
      tenantId: tenant.id,
      name: 'Administrador',
      email: adminEmail,
      passwordHash,
      role: Role.ADMIN,
      superAdmin: false,
    },
  });

  await seedMessageTemplates(prisma, tenant.id);
  await seedDefaultCategories(prisma, tenant.id);

  console.log('✔ Seed (dev/CI) concluído');
  console.log(`  Oficina: ${tenant.name} (${tenant.slug})`);
  console.log(`  Admin:   ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
