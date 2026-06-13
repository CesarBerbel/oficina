import { MessageChannel, MessageEvent, PrismaClient, Role } from '@prisma/client';
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
