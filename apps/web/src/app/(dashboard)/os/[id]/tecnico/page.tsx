'use client';

import { use } from 'react';
import { OsDetailView } from '@/features/service-orders/os-detail-view';

export default function ServiceOrderTechnicianPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <OsDetailView id={id} variant="technician" />;
}
