import { CategoryKind, type PrismaClient } from '@prisma/client';

/**
 * Categorias padrão criadas para toda nova oficina (onboarding) — clientes,
 * serviços e peças. Editáveis depois em Configurações › Categorias.
 */
export const DEFAULT_CATEGORIES: Partial<Record<CategoryKind, string[]>> = {
  CUSTOMER: [
    'Padrão',
    'Frotista',
    'Seguradora',
    'Locadora',
    'Órgão Público',
    'Revenda de Veículos',
    'Parceiro',
  ],
  SERVICE: [
    'Manutenção Preventiva',
    'Motor',
    'Suspensão',
    'Freios',
    'Direção',
    'Transmissão',
    'Elétrica',
    'Ar Condicionado',
    'Arrefecimento',
    'Pneus e Alinhamento',
    'Diagnóstico',
    'Funilaria e Pintura',
    'Serviços Gerais',
  ],
  PART: [
    'Motor',
    'Suspensão',
    'Freios',
    'Direção',
    'Transmissão',
    'Elétrica',
    'Ar Condicionado',
    'Arrefecimento',
    'Combustível',
    'Pneus e Rodas',
    'Lubrificantes e Fluidos',
    'Acessórios',
    'Consumíveis',
  ],
  // Marcas de autopeças mais usadas nas oficinas do Brasil.
  BRAND: [
    'Bosch',
    'NGK',
    'Cofap',
    'Monroe',
    'Nakata',
    'SKF',
    'Mahle',
    'Magneti Marelli',
    'Valeo',
    'Continental',
    'TRW',
    'Fras-le',
    'Tecfil',
    'Mann-Filter',
    'Wega',
    'Gates',
    'Dayco',
    'Sabó',
    'Moura',
    'Heliar',
    'Philips',
    'Osram',
  ],
};

/** Cria as categorias padrão de um tenant (idempotente). Retorna quantas criou. */
export async function seedDefaultCategories(
  prisma: PrismaClient,
  tenantId: string,
): Promise<number> {
  const data = (Object.entries(DEFAULT_CATEGORIES) as Array<[CategoryKind, string[]]>).flatMap(
    ([kind, names]) => names.map((name) => ({ tenantId, kind, name })),
  );

  const res = await prisma.category.createMany({ data, skipDuplicates: true });
  return res.count;
}
