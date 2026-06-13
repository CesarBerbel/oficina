import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  NfeConfirmInput,
  NfeConfirmResult,
  NfeParseResult,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { applyStockMovement } from '../inventory/stock.helper';
import { parseNfeBuffer } from './nfe-parser';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Injectable()
export class NfeImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Lê o arquivo e devolve os itens para conferência (não grava nada). */
  async parse(
    tenantId: string,
    buffer: Buffer,
    filename: string,
  ): Promise<NfeParseResult> {
    let raw;
    try {
      raw = parseNfeBuffer(buffer, filename);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Falha ao ler o XML',
      );
    }

    // Localiza fornecedor por CNPJ.
    let matchedSupplierId: string | null = null;
    if (raw.supplierCnpj) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { tenantId, document: raw.supplierCnpj.replace(/\D/g, '') },
        select: { id: true },
      });
      matchedSupplierId = supplier?.id ?? null;
    }

    // Localiza peças existentes por código da peça (cProd) ou EAN.
    const skus = raw.items.map((i) => i.cProd).filter(Boolean) as string[];
    const eans = raw.items.map((i) => i.ean).filter(Boolean) as string[];
    const existing = await this.prisma.part.findMany({
      where: {
        tenantId,
        OR: [
          ...(skus.length ? [{ sku: { in: skus } }] : []),
          ...(eans.length ? [{ ean: { in: eans } }] : []),
        ],
      },
      select: { id: true, sku: true, ean: true },
    });
    const bySku = new Map(existing.filter((p) => p.sku).map((p) => [p.sku!, p.id]));
    const byEan = new Map(existing.filter((p) => p.ean).map((p) => [p.ean!, p.id]));

    return {
      supplierCnpj: raw.supplierCnpj,
      supplierName: raw.supplierName,
      matchedSupplierId,
      fileName: filename,
      items: raw.items.map((i) => ({
        cProd: i.cProd,
        ean: i.ean,
        name: i.name,
        unit: i.unit,
        quantity: i.quantity,
        unitCost: i.unitCost,
        total: i.total,
        ncm: i.ncm,
        cest: i.cest,
        cfop: i.cfop,
        matchedPartId:
          (i.cProd && bySku.get(i.cProd)) ||
          (i.ean && byEan.get(i.ean)) ||
          null,
      })),
    };
  }

  /** Cadastra/atualiza as peças conferidas e, opcionalmente, dá entrada no estoque. */
  async confirm(
    actor: AuthenticatedUser,
    input: NfeConfirmInput,
  ): Promise<NfeConfirmResult> {
    const items = input.items.filter((i) => i.include);
    if (items.length === 0) {
      throw new BadRequestException('Nenhum item selecionado para importar');
    }

    let created = 0;
    let updated = 0;
    let stockEntries = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        // Resolve a peça: por id, depois código da peça, senão cria.
        let partId = item.partId ?? null;
        if (!partId && item.sku) {
          const found = await tx.part.findFirst({
            where: { tenantId: actor.tenantId, sku: item.sku },
            select: { id: true },
          });
          partId = found?.id ?? null;
        }

        const data = {
          name: item.name,
          sku: item.sku ?? null,
          ncm: item.ncm ?? null,
          ean: item.ean ?? null,
          type: item.type,
          category: item.category ?? null,
          brand: item.brand ?? null,
          unit: item.unit,
          minStock: item.minStock,
          costPrice: item.costPrice,
          salePrice: item.salePrice,
          description: item.description ?? null,
        };

        if (partId) {
          await tx.part.update({ where: { id: partId }, data });
          updated++;
        } else {
          const part = await tx.part.create({
            data: { tenantId: actor.tenantId, ...data, currentStock: 0 },
            select: { id: true },
          });
          partId = part.id;
          created++;
        }

        if (input.registerStock && item.quantity > 0) {
          await applyStockMovement(tx, {
            tenantId: actor.tenantId,
            partId,
            type: 'ENTRADA',
            quantity: item.quantity,
            unitCost: item.costPrice,
            note: `Importação NF-e${input.supplierName ? ` · ${input.supplierName}` : ''}`,
            userId: actor.id,
          });
          stockEntries++;
        }
      }
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'NFE_IMPORT',
      module: 'nfe-import',
      entity: 'Part',
      after: { created, updated, stockEntries, registerStock: input.registerStock },
    });

    return { created, updated, stockEntries };
  }
}
