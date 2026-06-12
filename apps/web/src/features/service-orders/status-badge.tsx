import {
  SERVICE_ORDER_STATUS_LABELS,
  type ServiceOrderStatus,
} from '@oficina/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const VARIANT: Record<ServiceOrderStatus, BadgeProps['variant']> = {
  ENTRADA: 'secondary',
  DIAGNOSTICO_PRONTO: 'default',
  ORCAMENTO: 'warning',
  ORCAMENTO_APROVADO: 'default',
  ORCAMENTO_RECUSADO: 'destructive',
  AGUARDANDO_PECA: 'warning',
  EM_EXECUCAO: 'default',
  EM_TESTE: 'warning',
  PRONTA: 'success',
  PRONTO_RETIRAR: 'success',
  ENTREGUE: 'secondary',
  CANCELADA: 'destructive',
};

export function StatusBadge({ status }: { status: ServiceOrderStatus }) {
  return (
    <Badge variant={VARIANT[status]}>
      {SERVICE_ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}
