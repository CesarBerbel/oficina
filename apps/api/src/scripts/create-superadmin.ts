/**
 * Cria (ou atualiza) o super usuário da plataforma — o dono do SaaS.
 *
 * Substitui o antigo instalador web (/instalar). Roda fora do app, no servidor:
 *
 *   Produção (imagem distroless):
 *     docker compose -f docker-compose.prod.yml exec \
 *       -e SUPERADMIN_EMAIL=voce@dominio.com -e SUPERADMIN_PASSWORD='SenhaForte#123' \
 *       api /nodejs/bin/node dist/scripts/create-superadmin.js
 *
 *   Desenvolvimento:
 *     pnpm --filter @oficina/api superadmin voce@local 'SenhaForte#123'
 *
 * O super admin vive numa conta "plataforma" (apenas o lar dele). As oficinas dos
 * clientes são criadas pelos pedidos em /comecar + aprovação no painel /contas.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = (process.env.SUPERADMIN_EMAIL ?? process.argv[2] ?? '').trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD ?? process.argv[3] ?? '';
  const name = (
    process.env.SUPERADMIN_NAME ??
    process.argv[4] ??
    'Administrador da Plataforma'
  ).trim();
  const accountSlug = (process.env.PLATFORM_ACCOUNT_SLUG ?? 'plataforma').trim().toLowerCase();
  const accountName = (process.env.PLATFORM_ACCOUNT_NAME ?? 'Plataforma').trim();

  if (!email || !email.includes('@')) {
    console.error('Erro: informe SUPERADMIN_EMAIL (ou 1º argumento) válido.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Erro: informe SUPERADMIN_PASSWORD (ou 2º argumento) com ao menos 8 caracteres.');
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  // Conta + oficina "lar" do super admin (slug usado também para o login no apex).
  const account = await prisma.account.upsert({
    where: { slug: accountSlug },
    update: {},
    create: { name: accountName, slug: accountSlug, status: 'ACTIVE' },
  });
  const tenant = await prisma.tenant.upsert({
    where: { slug: accountSlug },
    update: { accountId: account.id },
    create: { name: accountName, slug: accountSlug, accountId: account.id },
  });

  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email } },
    update: { passwordHash, role: 'ADMIN', active: true, superAdmin: true },
    create: {
      tenantId: tenant.id,
      name,
      email,
      passwordHash,
      role: 'ADMIN',
      active: true,
      superAdmin: true,
    },
    select: { id: true },
  });

  console.log('✔ Super admin pronto.');
  console.log(`  E-mail:  ${email}`);
  console.log(`  Oficina: ${accountSlug}  (use este identificador no login pelo apex)`);
  console.log(`  ID:      ${user.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
