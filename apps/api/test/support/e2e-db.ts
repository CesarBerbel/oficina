import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { ensureE2eEnv } from './e2e-env';

export const TEST_PASSWORD = 'Admin@123';
export const TENANT_SLUG = 'oficina-modelo';
export const OTHER_TENANT_SLUG = 'oficina-concorrente';

export interface SeedUser {
  id: string;
  email: string;
  role: Role;
}

export interface SeedTenant {
  id: string;
  slug: string;
  admin: SeedUser;
  atendente: SeedUser;
  tecnico: SeedUser;
  estoquista: SeedUser;
  inactive: SeedUser;
}

export interface SeedData {
  tenant: SeedTenant;
  otherTenant: {
    id: string;
    slug: string;
    admin: SeedUser;
  };
}

export const prisma = new PrismaClient();

export async function resetDatabase(): Promise<void> {
  ensureE2eEnv();
  // accounts é pai de tenants; ops_heartbeat é global. Trunca os três (CASCADE
  // limpa o resto via FK a partir de tenants).
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "accounts", "tenants", "ops_heartbeat" RESTART IDENTITY CASCADE',
  );
}

/** Saldo/reserva de estoque de uma peça numa oficina (PartStock por filial). */
export async function partStockOf(
  tenantId: string,
  partId: string,
): Promise<{ currentStock: number; reservedStock: number }> {
  const row = await prisma.partStock.findUnique({
    where: { tenantId_partId: { tenantId, partId } },
    select: { currentStock: true, reservedStock: true },
  });
  return {
    currentStock: Number(row?.currentStock ?? 0),
    reservedStock: Number(row?.reservedStock ?? 0),
  };
}

/** Cria uma filial sob a matriz (com um admin) para os testes de grupo. */
export async function createBranchTenant(
  parentTenantId: string,
  opts: { slug: string; name?: string; adminEmail?: string },
): Promise<{ id: string; slug: string; admin: SeedUser }> {
  const passwordHash = await argon2.hash(TEST_PASSWORD);
  const parent = await prisma.tenant.findUniqueOrThrow({
    where: { id: parentTenantId },
    select: { accountId: true },
  });
  const branch = await prisma.tenant.create({
    data: {
      name: opts.name ?? `Filial ${opts.slug}`,
      slug: opts.slug,
      parentId: parentTenantId,
      accountId: parent.accountId,
    },
  });
  const admin = await createUser({
    tenantId: branch.id,
    name: 'Admin Filial E2E',
    email: opts.adminEmail ?? `admin@${opts.slug}.local`,
    role: Role.ADMIN,
    passwordHash,
  });
  return { id: branch.id, slug: branch.slug, admin };
}

async function createUser(input: {
  tenantId: string;
  name: string;
  email: string;
  role: Role;
  active?: boolean;
  passwordHash: string;
}): Promise<SeedUser> {
  const user = await prisma.user.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
      active: input.active ?? true,
    },
  });
  return { id: user.id, email: user.email, role: user.role };
}

async function createPublishedSite(tenantId: string, shopName: string): Promise<void> {
  await prisma.siteSettings.create({
    data: {
      tenantId,
      shopName,
      tagline: 'Mecânica multimarcas com diagnóstico preciso.',
      heroTitle: `Bem-vindo à ${shopName}`,
      heroSubtitle: 'Atendimento transparente, rápido e com garantia.',
      phone: '(11) 3333-4444',
      whatsapp: '(11) 99999-0000',
      email: 'contato@oficina.local',
      address: 'Rua dos Testes, 123',
      hours: 'Segunda a sexta, 08h às 18h',
      published: true,
    },
  });
}

export async function seedE2eData(): Promise<SeedData> {
  const passwordHash = await argon2.hash(TEST_PASSWORD);

  const account = await prisma.account.create({
    data: { name: 'Oficina Modelo', slug: TENANT_SLUG, status: 'ACTIVE' },
  });
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Oficina Modelo',
      slug: TENANT_SLUG,
      accountId: account.id,
    },
  });

  const otherAccount = await prisma.account.create({
    data: { name: 'Oficina Concorrente', slug: OTHER_TENANT_SLUG, status: 'ACTIVE' },
  });
  const otherTenant = await prisma.tenant.create({
    data: {
      name: 'Oficina Concorrente',
      slug: OTHER_TENANT_SLUG,
      accountId: otherAccount.id,
    },
  });

  const [admin, atendente, tecnico, estoquista, inactive, otherAdmin] = await Promise.all([
    createUser({
      tenantId: tenant.id,
      name: 'Administrador E2E',
      email: 'admin@oficina.local',
      role: Role.ADMIN,
      passwordHash,
    }),
    createUser({
      tenantId: tenant.id,
      name: 'Atendente E2E',
      email: 'atendente@oficina.local',
      role: Role.ATENDENTE,
      passwordHash,
    }),
    createUser({
      tenantId: tenant.id,
      name: 'Técnico E2E',
      email: 'tecnico@oficina.local',
      role: Role.TECNICO,
      passwordHash,
    }),
    createUser({
      tenantId: tenant.id,
      name: 'Estoquista E2E',
      email: 'estoque@oficina.local',
      role: Role.ESTOQUISTA,
      passwordHash,
    }),
    createUser({
      tenantId: tenant.id,
      name: 'Usuário Inativo E2E',
      email: 'inativo@oficina.local',
      role: Role.ATENDENTE,
      active: false,
      passwordHash,
    }),
    createUser({
      tenantId: otherTenant.id,
      name: 'Admin Outra Oficina',
      email: 'admin@concorrente.local',
      role: Role.ADMIN,
      passwordHash,
    }),
  ]);

  await Promise.all([
    createPublishedSite(tenant.id, 'Oficina Modelo'),
    createPublishedSite(otherTenant.id, 'Oficina Concorrente'),
    prisma.service.create({
      data: {
        tenantId: tenant.id,
        name: 'Revisão preventiva',
        category: 'Revisão',
        description: 'Checklist completo dos principais sistemas do veículo.',
        salePrice: 250,
        cost: 80,
        estimatedMinutes: 90,
        showOnSite: true,
      },
    }),
  ]);

  return {
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      admin,
      atendente,
      tecnico,
      estoquista,
      inactive,
    },
    otherTenant: {
      id: otherTenant.id,
      slug: otherTenant.slug,
      admin: otherAdmin,
    },
  };
}

export async function resetAndSeed(): Promise<SeedData> {
  await resetDatabase();
  return seedE2eData();
}

afterAll(async () => {
  await prisma.$disconnect();
});
