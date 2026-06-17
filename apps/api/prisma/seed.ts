import { PrismaClient, Role } from '@prisma/client';
import { seedMessageTemplates } from './seed-templates';
import { seedDefaultCategories } from '../src/modules/categories/default-categories';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main(): Promise<void> {
  const tenantName = process.env.SEED_TENANT_NAME ?? 'Oficina Modelo';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@oficina.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';
  const tenantSlug = process.env.SEED_TENANT_SLUG ?? tenantName;

  const slug = slugify(tenantSlug);

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {},
    create: { name: tenantName, slug },
  });

  const passwordHash = await argon2.hash(adminPassword);

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    update: { passwordHash, role: Role.ADMIN, active: true },
    create: {
      tenantId: tenant.id,
      name: 'Administrador',
      email: adminEmail,
      passwordHash,
      role: Role.ADMIN,
    },
  });



  await seedMessageTemplates(prisma, tenant.id);
  await seedDefaultCategories(prisma, tenant.id);

  console.log('✔ Seed concluído');
  console.log(`  Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`  Admin:  ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
