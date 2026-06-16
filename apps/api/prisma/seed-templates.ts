import { MessageChannel, MessageEvent, PrismaClient } from '@prisma/client';

interface BaseTemplate {
  event: MessageEvent;
  name: string;
  body: string;
}

/**
 * Templates de mensagem padrão (um por evento). Cada um é criado em dois canais
 * (WhatsApp e E-mail). Variáveis disponíveis: {{cliente.nome}}, {{os.numero}},
 * {{os.link}}, {{veiculo.modelo}}, {{veiculo.placa}}, {{oficina.nome}}.
 * Aniversário (CUSTOMER_BIRTHDAY) só tem {{cliente.nome}} e {{oficina.nome}}.
 */
export const BASE_MESSAGE_TEMPLATES: BaseTemplate[] = [
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
  {
    event: MessageEvent.CUSTOMER_BIRTHDAY,
    name: 'Aniversário do cliente',
    body: 'Olá {{cliente.nome}}, a equipe da {{oficina.nome}} deseja um feliz aniversário! 🎉 Conte com a gente para cuidar do seu veículo.',
  },
];

/**
 * Cria os templates padrão (WhatsApp + E-mail) para um tenant, sem duplicar os
 * que já existirem. Retorna quantos foram criados.
 */
export async function seedMessageTemplates(
  prisma: PrismaClient,
  tenantId: string,
): Promise<number> {
  const templates = BASE_MESSAGE_TEMPLATES.flatMap((t) => [
    { ...t, channel: MessageChannel.WHATSAPP, name: `${t.name} — WhatsApp` },
    { ...t, channel: MessageChannel.EMAIL, name: `${t.name} — E-mail` },
  ]);

  let created = 0;
  for (const t of templates) {
    const existing = await prisma.messageTemplate.findFirst({
      where: { tenantId, event: t.event, channel: t.channel, name: t.name },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.messageTemplate.create({
      data: {
        tenantId,
        name: t.name,
        event: t.event,
        channel: t.channel,
        body: t.body,
        active: true,
        autoSend: true,
      },
    });
    created += 1;
  }
  return created;
}

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
