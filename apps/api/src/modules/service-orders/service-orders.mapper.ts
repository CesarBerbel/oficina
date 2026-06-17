import { Prisma } from '@prisma/client';
import {
  isOrderEditable,
  isTerminalStatus,
  type ServiceOrderBoardItemDto,
  type ServiceOrderDetailDto,
  type ServiceOrderEventDto,
  type ServiceOrderStatus,
  type ServiceOrderSummaryDto,
  type ServiceOrderTechnicalChecklistItem,
  type ServiceOrderTransitionDto,
} from '@oficina/shared';
import { toQuoteDto } from '../quotes/quote.mapper';
import { ServiceOrderStateMachine } from './domain/service-order.state-machine';
import type { BoardRow, DetailRow, EventRow, SummaryRow } from './service-orders.includes';

/**
 * Mapeadores puros (row do Prisma → DTO) da OS. Extraídos do service para
 * reduzir seu tamanho e permitir reuso/teste isolado.
 */

const dec = (v: Prisma.Decimal | number | null | undefined): number => (v == null ? 0 : Number(v));

export function isOverdue(row: { dueDate: Date | null; status: ServiceOrderStatus }): boolean {
  if (!row.dueDate) return false;
  if (['ENTREGUE', 'CANCELADA', 'PRONTO_RETIRAR'].includes(row.status)) return false;
  return row.dueDate.getTime() < Date.now();
}

export function availableTransitionsFor(context: {
  status: ServiceOrderStatus;
  diagnosis: string | null;
  itemCount: number;
  quoteStatus: 'RASCUNHO' | 'ENVIADO' | 'APROVADO' | 'APROVADO_PARCIAL' | 'RECUSADO' | null;
}): ServiceOrderTransitionDto[] {
  return ServiceOrderStateMachine.availableTransitions(context);
}

export function toSummaryDto(row: SummaryRow): ServiceOrderSummaryDto {
  const year = row.vehicle.modelYear ? ` ${row.vehicle.modelYear}` : '';
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    customerId: row.customerId,
    customerName: row.customer.name,
    vehicleId: row.vehicleId,
    vehiclePlate: row.vehicle.plate,
    vehicleLabel: `${row.vehicle.manufacturer} ${row.vehicle.model}${year}`,
    technicianId: row.technicianId,
    technicianName: row.technician?.name ?? null,
    total: dec(row.total),
    openedAt: row.openedAt.toISOString(),
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    isOverdue: isOverdue(row),
  };
}

export function toBoardItemDto(row: BoardRow): ServiceOrderBoardItemDto {
  return {
    ...toSummaryDto(row),
    availableTransitions: availableTransitionsFor({
      status: row.status,
      diagnosis: row.diagnosis,
      itemCount: row.items.length,
      quoteStatus: row.quote?.status ?? null,
    }),
  };
}

export function toEventDto(row: EventRow): ServiceOrderEventDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    checklist: (row.checklist as unknown as ServiceOrderTechnicalChecklistItem[] | null) ?? [],
    photos: row.photos,
    createdByName: row.createdBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toDetailDto(row: DetailRow): ServiceOrderDetailDto {
  return {
    ...toSummaryDto(row),
    km: row.km,
    reportedProblem: row.reportedProblem,
    diagnosis: row.diagnosis,
    notes: row.notes,
    customerPhone: row.customer.phone,
    customerWhatsapp: row.customer.whatsapp,
    vehicleManufacturer: row.vehicle.manufacturer,
    vehicleModel: row.vehicle.model,
    vehicleModelYear: row.vehicle.modelYear,
    totalServices: dec(row.totalServices),
    totalParts: dec(row.totalParts),
    discount: dec(row.discount),
    editable: isOrderEditable(row.status),
    terminal: isTerminalStatus(row.status),
    availableTransitions: availableTransitionsFor({
      status: row.status,
      diagnosis: row.diagnosis,
      itemCount: row.items.length,
      quoteStatus: row.quote?.status ?? null,
    }),
    items: (() => {
      const byId = new Map(row.items.map((it) => [it.id, it.description]));
      return row.items.map((it) => ({
        id: it.id,
        kind: it.kind,
        description: it.description,
        quantity: dec(it.quantity),
        unitPrice: dec(it.unitPrice),
        total: dec(it.total),
        comboLabel: it.comboLabel,
        parentItemId: it.parentItemId,
        linkedServiceName: it.parentItemId ? (byId.get(it.parentItemId) ?? null) : null,
      }));
    })(),
    history: row.history.map((h) => ({
      id: h.id,
      status: h.status,
      note: h.note,
      userName: h.user?.name ?? null,
      createdAt: h.createdAt.toISOString(),
    })),
    events: row.events.map((event) => toEventDto(event)),
    publicToken: row.publicToken,
    quote: row.quote ? toQuoteDto(row.quote, row.publicToken) : null,
    checkinId: row.checkins[0]?.id ?? null,
  };
}
