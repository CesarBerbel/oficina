import type {
  LeadContactAttemptDto,
  LeadCustomerSuggestionDto,
  LeadDto,
  LeadEventDto,
  LeadMatchSummaryDto,
  LeadVehicleMatchDto,
  ReceptionScheduleBlockDto,
} from '@oficina/shared';
import {
  digits,
  leadOperationalScore,
  type CustomerSuggestionSource,
  type LeadDetailRow,
  type LeadRow,
  type ReceptionScheduleBlockRow,
  type VehicleMatchSource,
} from './leads.support';

/**
 * Mapeadores puros (row do Prisma → DTO) e heurística de match do módulo de
 * leads. Sem dependência de `this`/serviços — extraídos para reduzir o service.
 */

export function toDto(l: LeadRow): LeadDto {
  const operational = leadOperationalScore(l);
  return {
    id: l.id,
    name: l.name,
    phone: l.phone,
    email: l.email,
    plate: l.plate,
    vehicle: l.vehicle,
    message: l.message,
    status: l.status,
    assignedToId: l.assignedToId,
    assignedToName: l.assignedToName,
    matchedCustomerId: l.matchedCustomerId,
    matchedVehicleId: l.matchedVehicleId,
    convertedCustomerId: l.convertedCustomerId,
    convertedVehicleId: l.convertedVehicleId,
    convertedServiceOrderId: l.convertedServiceOrderId,
    conflictLevel: l.conflictLevel,
    conflictReason: l.conflictReason,
    operationalScore: operational.score,
    operationalPriority: operational.priority,
    operationalReasons: operational.reasons,
    nextFollowUpAt: l.nextFollowUpAt?.toISOString() ?? null,
    appointmentStartAt: l.appointmentStartAt?.toISOString() ?? null,
    appointmentEndAt: l.appointmentEndAt?.toISOString() ?? null,
    appointmentServiceType: l.appointmentServiceType,
    appointmentNotes: l.appointmentNotes,
    appointmentConfirmedAt: l.appointmentConfirmedAt?.toISOString() ?? null,
    checkedInAt: l.checkedInAt?.toISOString() ?? null,
    noShowAt: l.noShowAt?.toISOString() ?? null,
    appointmentCanceledAt: l.appointmentCanceledAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

export function toScheduleBlockDto(row: ReceptionScheduleBlockRow): ReceptionScheduleBlockDto {
  return {
    id: row.id,
    technicianId: row.technicianId,
    technicianName: row.technician?.name ?? null,
    title: row.title,
    notes: row.notes,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toContactDto(row: LeadDetailRow['contactAttempts'][number]): LeadContactAttemptDto {
  return {
    id: row.id,
    channel: row.channel,
    outcome: row.outcome,
    notes: row.notes,
    nextFollowUpAt: row.nextFollowUpAt?.toISOString() ?? null,
    userName: row.userName,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toEventDto(row: LeadDetailRow['events'][number]): LeadEventDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    userName: row.userName,
    createdAt: row.createdAt.toISOString(),
  };
}

export function customerSuggestion(
  customer: CustomerSuggestionSource,
  lead: Pick<LeadRow, 'name' | 'phone' | 'email'>,
): LeadCustomerSuggestionDto {
  const leadPhone = digits(lead.phone);
  const customerPhone = digits(customer.phone);
  const customerWhatsapp = digits(customer.whatsapp);
  const leadEmail = lead.email?.toLowerCase() ?? null;
  const customerEmail = customer.email?.toLowerCase() ?? null;
  const leadName = lead.name.toLowerCase();
  const customerName = customer.name.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  if (leadPhone && (leadPhone === customerPhone || leadPhone === customerWhatsapp)) {
    score += 70;
    reasons.push('telefone confere');
  }
  if (leadEmail && customerEmail && leadEmail === customerEmail) {
    score += 60;
    reasons.push('e-mail confere');
  }
  if (customerName === leadName) {
    score += 40;
    reasons.push('nome igual');
  } else if (customerName.includes(leadName) || leadName.includes(customerName)) {
    score += 25;
    reasons.push('nome parecido');
  }

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    whatsapp: customer.whatsapp,
    email: customer.email,
    score,
    reason: reasons.length > 0 ? reasons.join(', ') : 'possível correspondência',
  };
}

export function vehicleMatchDto(vehicle: VehicleMatchSource): LeadVehicleMatchDto {
  return {
    id: vehicle.id,
    plate: vehicle.plate,
    manufacturer: vehicle.manufacturer,
    model: vehicle.model,
    modelYear: vehicle.modelYear,
    customerId: vehicle.customerId,
    customerName: vehicle.customer.name,
  };
}

export function evaluateMatch(
  lead: LeadRow,
  suggestedCustomers: LeadCustomerSuggestionDto[],
  vehicle: LeadVehicleMatchDto | null,
): LeadMatchSummaryDto {
  const preferredCustomerId = lead.matchedCustomerId ?? suggestedCustomers[0]?.id ?? null;

  if (vehicle && preferredCustomerId && vehicle.customerId !== preferredCustomerId) {
    return {
      suggestedCustomers,
      vehicle,
      conflictLevel: 'ATENCAO',
      conflictReason: `A placa ${vehicle.plate} já está cadastrada para ${vehicle.customerName}. Confira antes de vincular ao cliente informado.`,
    };
  }

  if (vehicle && preferredCustomerId && vehicle.customerId === preferredCustomerId) {
    return {
      suggestedCustomers,
      vehicle,
      conflictLevel: 'OK',
      conflictReason: 'Cliente e veículo conferem.',
    };
  }

  if (vehicle && !preferredCustomerId) {
    return {
      suggestedCustomers,
      vehicle,
      conflictLevel: 'ATENCAO',
      conflictReason: `A placa ${vehicle.plate} já existe e pertence a ${vehicle.customerName}.`,
    };
  }

  if (!vehicle && suggestedCustomers.length > 0) {
    return {
      suggestedCustomers,
      vehicle,
      conflictLevel: 'ATENCAO',
      conflictReason: 'Cliente parecido encontrado. Confira telefone/e-mail antes de vincular.',
    };
  }

  return {
    suggestedCustomers,
    vehicle,
    conflictLevel: 'SEM_DADOS',
    conflictReason: 'Nenhum cliente ou veículo encontrado automaticamente.',
  };
}
