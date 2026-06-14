import { MessageChannel, MessageEvent, PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

type SeedOptions = {
  tenantName?: string;
  tenantSlug?: string;
  adminEmail?: string;
  adminPassword?: string;
};

const ARG_ALIASES: Record<string, keyof SeedOptions> = {
  oficina: 'tenantName',
  tenant: 'tenantName',
  nome: 'tenantName',
  name: 'tenantName',
  slug: 'tenantSlug',
  user: 'adminEmail',
  usuario: 'adminEmail',
  email: 'adminEmail',
  senha: 'adminPassword',
  password: 'adminPassword',
};

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function cleanValue(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function shouldPrintHelp(args: string[]): boolean {
  return args.includes('--help') || args.includes('-h');
}

function printHelp(): void {
  console.log(`Uso:
  pnpm prisma:seed -- --oficina "Auto Mecânica Bandeirantes" --slug automec-band --user adm@adm.com --senha 321654

Opções:
  --oficina, --tenant, --nome, --name    Nome da oficina/tenant
  --slug                                Slug usado no login e no site público
  --user, --usuario, --email            E-mail do usuário administrador
  --senha, --password                   Senha do usuário administrador

Também é possível usar variáveis de ambiente:
  SEED_TENANT_NAME
  SEED_TENANT_SLUG
  SEED_ADMIN_EMAIL
  SEED_ADMIN_PASSWORD`);
}

function parseSeedArgs(args: string[]): SeedOptions {
  const options: SeedOptions = {};
  let index = 0;

  while (index < args.length) {
    const rawArg = args[index];

    if (!rawArg.startsWith('--')) {
      index += 1;
      continue;
    }

    const [rawKey, inlineValue] = rawArg.slice(2).split(/=(.*)/s, 2);
    const optionKey = ARG_ALIASES[rawKey];

    if (!optionKey) {
      index += 1;
      continue;
    }

    if (inlineValue !== undefined) {
      const value = cleanValue(inlineValue);
      if (!value) throw new Error(`Informe um valor para --${rawKey}.`);
      options[optionKey] = value;
      index += 1;
      continue;
    }

    const valueParts: string[] = [];
    let nextIndex = index + 1;
    while (nextIndex < args.length && !args[nextIndex].startsWith('--')) {
      valueParts.push(args[nextIndex]);
      nextIndex += 1;
    }

    const value = cleanValue(valueParts.join(' '));
    if (!value) throw new Error(`Informe um valor para --${rawKey}.`);

    options[optionKey] = value;
    index = nextIndex;
  }

  return options;
}

function getSeedOptions(): Required<SeedOptions> {
  const cliOptions = parseSeedArgs(process.argv.slice(2));
  const tenantName =
    cleanValue(cliOptions.tenantName) ??
    cleanValue(process.env.SEED_TENANT_NAME) ??
    'Oficina Modelo';
  const tenantSlug =
    cleanValue(cliOptions.tenantSlug) ??
    cleanValue(process.env.SEED_TENANT_SLUG) ??
    tenantName;
  const adminEmail =
    cleanValue(cliOptions.adminEmail) ??
    cleanValue(process.env.SEED_ADMIN_EMAIL) ??
    'admin@oficina.local';
  const adminPassword =
    cleanValue(cliOptions.adminPassword) ??
    cleanValue(process.env.SEED_ADMIN_PASSWORD) ??
    'Admin@123';

  const slug = slugify(tenantSlug);
  if (!slug) throw new Error('Informe um slug válido para a oficina.');

  return {
    tenantName,
    tenantSlug: slug,
    adminEmail,
    adminPassword,
  };
}

async function main(): Promise<void> {
  if (shouldPrintHelp(process.argv.slice(2))) {
    printHelp();
    return;
  }

  const { tenantName, tenantSlug, adminEmail, adminPassword } = getSeedOptions();

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: { name: tenantName, active: true },
    create: { name: tenantName, slug: tenantSlug },
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

  const baseTemplates: Array<{
    event: MessageEvent;
    name: string;
    body: string;
  }> = [
    {
      event: MessageEvent.OS_OPENED,
      name: 'OS aberta',
      body: 'Olá {{cliente.nome}}, recebemos seu veículo {{veiculo.modelo}} placa {{veiculo.placa}}. OS #{{os.numero}} aberta na {{oficina.nome}}.',
    },
    {
      event: MessageEvent.DIAGNOSIS_READY,
      name: 'Diagnóstico pronto',
      body: 'Olá {{cliente.nome}}, o diagnóstico da OS #{{os.numero}} está pronto. Em breve enviaremos o orçamento.',
    },
    {
      event: MessageEvent.QUOTE_SENT,
      name: 'Orçamento enviado',
      body: 'Olá {{cliente.nome}}, seu orçamento da OS #{{os.numero}} está disponível: {{os.link}}',
    },
    {
      event: MessageEvent.QUOTE_APPROVED,
      name: 'Orçamento aprovado',
      body: 'Olá {{cliente.nome}}, recebemos a aprovação da OS #{{os.numero}} e vamos iniciar a programação do serviço.',
    },
    {
      event: MessageEvent.OS_IN_EXECUTION,
      name: 'OS em execução',
      body: 'Olá {{cliente.nome}}, a OS #{{os.numero}} está em execução.',
    },
    {
      event: MessageEvent.OS_READY,
      name: 'OS pronta',
      body: 'Olá {{cliente.nome}}, finalizamos o serviço da OS #{{os.numero}}. Vamos avisar quando estiver liberado para retirada.',
    },
    {
      event: MessageEvent.CUSTOMER_NOTIFIED,
      name: 'Retirada liberada',
      body: 'Olá {{cliente.nome}}, seu veículo {{veiculo.modelo}} placa {{veiculo.placa}} está pronto para retirada na {{oficina.nome}}.',
    },
    {
      event: MessageEvent.VEHICLE_DELIVERED,
      name: 'Veículo entregue',
      body: 'Olá {{cliente.nome}}, registramos a entrega do veículo da OS #{{os.numero}}. Obrigado pela confiança!',
    },
  ];

  const templates = baseTemplates.flatMap((template) => [
    {
      ...template,
      channel: MessageChannel.WHATSAPP,
      name: `${template.name} — WhatsApp`,
    },
    {
      ...template,
      channel: MessageChannel.EMAIL,
      name: `${template.name} — E-mail`,
    },
  ]);

  for (const template of templates) {
    const existing = await prisma.messageTemplate.findFirst({
      where: {
        tenantId: tenant.id,
        event: template.event,
        channel: template.channel,
        name: template.name,
      },
      select: { id: true },
    });
    if (!existing) {
      await prisma.messageTemplate.create({
        data: {
          tenantId: tenant.id,
          name: template.name,
          event: template.event,
          channel: template.channel,
          body: template.body,
          active: true,
          autoSend: true,
        },
      });
    }
  }

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
