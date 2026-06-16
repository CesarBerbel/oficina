import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import {
  CHECKLIST_STATUS_LABELS,
  DAMAGE_SEVERITY_LABELS,
  FUEL_LEVEL_LABELS,
  type ChecklistItem,
  type ChecklistStatus,
  type DamagePoint,
  type DamageSeverity,
  type FuelLevel,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { renderServiceOrderPdf, type ShopInfo } from './service-order-pdf.renderer';

const dt = (d: Date | null): string =>
  d ? new Intl.DateTimeFormat('pt-BR').format(d) : '—';


@Injectable()
export class PdfService {
  constructor(private readonly prisma: PrismaService) {}

  async serviceOrderPdf(
    tenantId: string,
    orderId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: orderId, tenantId },
      include: {
        tenant: { select: { name: true, cnpj: true } },
        customer: true,
        vehicle: true,
        items: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('OS não encontrada');

    // Dados da oficina vêm das configurações do site (fallback no tenant).
    const settings = await this.prisma.siteSettings.findUnique({
      where: { tenantId },
    });
    const shop: ShopInfo = {
      name: settings?.shopName || order.tenant.name,
      cnpj: settings?.cnpj || order.tenant.cnpj || null,
      phone: settings?.phone || null,
      whatsapp: settings?.whatsapp || null,
      email: settings?.email || null,
      address: settings?.address || null,
      addressZip: settings?.addressZip || null,
      addressStreet: settings?.addressStreet || null,
      addressNumber: settings?.addressNumber || null,
      addressComplement: settings?.addressComplement || null,
      addressDistrict: settings?.addressDistrict || null,
      addressCity: settings?.addressCity || null,
      addressState: settings?.addressState || null,
      pdfFooterText: settings?.pdfFooterText || null,
    };
    const logo = await this.fetchLogo(settings?.logoPdfUrl || settings?.logoUrl || null);

    const buffer = await renderServiceOrderPdf(order, shop, logo);
    return { buffer, filename: `OS-${order.number}.pdf` };
  }

  async checkinPdf(
    tenantId: string,
    id: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const checkin = await this.prisma.vehicleCheckin.findFirst({
      where: { id, tenantId },
      include: {
        tenant: { select: { name: true, cnpj: true } },
        customer: true,
        vehicle: true,
        serviceOrder: { select: { number: true } },
        createdBy: { select: { name: true } },
      },
    });
    if (!checkin) throw new NotFoundException('Check-in não encontrado');

    const settings = await this.prisma.siteSettings.findUnique({
      where: { tenantId },
    });
    const shop: ShopInfo = {
      name: settings?.shopName || checkin.tenant.name,
      cnpj: settings?.cnpj || checkin.tenant.cnpj || null,
      phone: settings?.phone || null,
      whatsapp: settings?.whatsapp || null,
      email: settings?.email || null,
      address: settings?.address || null,
      addressZip: settings?.addressZip || null,
      addressStreet: settings?.addressStreet || null,
      addressNumber: settings?.addressNumber || null,
      addressComplement: settings?.addressComplement || null,
      addressDistrict: settings?.addressDistrict || null,
      addressCity: settings?.addressCity || null,
      addressState: settings?.addressState || null,
      pdfFooterText: settings?.pdfFooterText || null,
    };
    const logo = await this.fetchLogo(
      settings?.logoPdfUrl || settings?.logoUrl || null,
    );
    const signature = await this.fetchLogo(checkin.signatureUrl);

    const buffer = await this.renderCheckin(checkin, shop, logo, signature);
    return { buffer, filename: `Checkin-OS-${checkin.serviceOrder.number}.pdf` };
  }

  /** Baixa a logo (PNG/JPEG) para embutir no PDF. Ignora falhas/formatos não suportados. */
  private async fetchLogo(url: string | null): Promise<Buffer | null> {
    if (!url) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const type = res.headers.get('content-type') ?? '';
      if (!/(png|jpe?g)/i.test(type)) return null; // pdfkit não embute svg/webp
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  private renderCheckin(
    checkin: Prisma.VehicleCheckinGetPayload<{
      include: {
        tenant: { select: { name: true; cnpj: true } };
        customer: true;
        vehicle: true;
        serviceOrder: { select: { number: true } };
        createdBy: { select: { name: true } };
      };
    }>,
    shop: ShopInfo,
    logo: Buffer | null,
    signature: Buffer | null,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const left = 36;
      const right = doc.page.width - 36;
      const width = right - left;
      const gray = '#6b7280';
      const dark = '#111827';
      const line = (yy: number) =>
        doc.moveTo(left, yy).lineTo(right, yy).strokeColor('#e5e7eb').stroke();
      const pageBreak = (yy: number, min = 760): number => {
        if (yy > min) {
          doc.addPage();
          return 40;
        }
        return yy;
      };

      // ─── Cabeçalho ───
      const headerTop = 38;
      let textX = left;
      if (logo) {
        try {
          doc.image(logo, left, headerTop, { fit: [104, 60] });
          textX = left + 118;
        } catch {
          textX = left;
        }
      }
      doc
        .fontSize(15)
        .font('Helvetica-Bold')
        .fillColor(dark)
        .text(shop.name, textX, headerTop + 2, { width: width - (textX - left) - 130 });
      if (shop.address) {
        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor(gray)
          .text(shop.address, textX, doc.y + 1, {
            width: width - (textX - left) - 130,
          });
      }
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(gray)
        .text('CHECK-IN DE ENTRADA', right - 200, headerTop + 1, {
          width: 200,
          align: 'right',
        });
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .fillColor(dark)
        .text(`OS Nº ${checkin.serviceOrder.number}`, right - 200, doc.y + 2, {
          width: 200,
          align: 'right',
        });
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor(gray)
        .text(`Emissão: ${dt(new Date())}`, right - 200, doc.y + 2, {
          width: 200,
          align: 'right',
        });

      let y = Math.max(headerTop + 70, doc.y + 10);
      line(y);
      y += 12;

      // ─── Cliente / Veículo ───
      const colW = width / 2 - 10;
      const labelVal = (x: number, yy: number, label: string, val: string) => {
        doc.fontSize(8).font('Helvetica').fillColor(gray).text(label, x, yy);
        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor(dark)
          .text(val || '—', x, yy + 10, { width: colW });
        return yy + 26;
      };
      doc.fontSize(11).font('Helvetica-Bold').fillColor(dark).text('CLIENTE', left, y);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(dark).text('VEÍCULO', left + colW + 20, y);
      let yc = y + 16;
      let yv = y + 16;
      yc = labelVal(left, yc, 'Nome', checkin.customer.name);
      yv = labelVal(left + colW + 20, yv, 'Placa', checkin.vehicle.plate);
      yc = labelVal(left, yc, 'Telefone', checkin.customer.phone ?? '—');
      yv = labelVal(
        left + colW + 20,
        yv,
        'Fabricante / Modelo',
        `${checkin.vehicle.manufacturer} ${checkin.vehicle.model}`,
      );
      const fuel: FuelLevel | null = checkin.fuelLevel;
      yc = labelVal(left, yc, 'KM de entrada', checkin.km != null ? String(checkin.km) : '—');
      yv = labelVal(
        left + colW + 20,
        yv,
        'Combustível',
        fuel ? FUEL_LEVEL_LABELS[fuel] : '—',
      );
      y = Math.max(yc, yv) + 6;
      line(y);
      y += 12;

      // ─── Checklist ───
      const checklist = (checkin.checklist as unknown as ChecklistItem[]) ?? [];
      if (checklist.length > 0) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor(dark).text('CHECKLIST', left, y);
        y = doc.y + 6;
        for (const it of checklist) {
          y = pageBreak(y);
          const status = it.status as ChecklistStatus;
          doc.fontSize(9).font('Helvetica-Bold').fillColor(dark).text(it.item, left, y, { width: 280 });
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor(gray)
            .text(CHECKLIST_STATUS_LABELS[status] ?? status, left + 290, y, {
              width: 80,
            });
          if (it.note) {
            doc.fontSize(8).font('Helvetica').fillColor(gray).text(it.note, left + 380, y, { width: width - 380 });
          }
          y = doc.y + 4;
        }
        y += 6;
        line(y);
        y += 12;
      }

      // ─── Avarias ───
      const damages = (checkin.damages as unknown as DamagePoint[]) ?? [];
      doc.fontSize(11).font('Helvetica-Bold').fillColor(dark).text('AVARIAS', left, y);
      y = doc.y + 6;
      if (damages.length === 0) {
        doc.fontSize(9).font('Helvetica').fillColor(gray).text('Nenhuma avaria registrada.', left, y);
        y = doc.y + 6;
      } else {
        for (const d of damages) {
          y = pageBreak(y);
          const sev = d.severity as DamageSeverity;
          doc
            .fontSize(9)
            .font('Helvetica-Bold')
            .fillColor(dark)
            .text(`• ${DAMAGE_SEVERITY_LABELS[sev] ?? sev}`, left, y, { width: 90 });
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor('#374151')
            .text(d.description, left + 100, y, { width: width - 100 });
          y = doc.y + 4;
        }
        y += 6;
      }
      line(y);
      y += 12;

      // ─── Observações ───
      if (checkin.notes) {
        y = pageBreak(y);
        doc.fontSize(10).font('Helvetica-Bold').fillColor(dark).text('Observações', left, y);
        y = doc.y + 2;
        doc.fontSize(10).font('Helvetica').fillColor('#374151').text(checkin.notes, left, y, { width });
        y = doc.y + 12;
      }

      // ─── Assinatura ───
      y = pageBreak(y + 20, 660);
      if (signature) {
        try {
          doc.image(signature, left + (width - 200) / 2, y, { fit: [200, 70] });
          y += 74;
        } catch {
          y += 40;
        }
      } else {
        y += 40;
      }
      doc.moveTo(left + 120, y).lineTo(right - 120, y).strokeColor('#9ca3af').stroke();
      doc
        .fontSize(9)
        .fillColor(gray)
        .text(
          checkin.signedBy
            ? `Assinatura do cliente · ${checkin.signedBy}`
            : 'Assinatura do cliente',
          left,
          y + 4,
          { width, align: 'center' },
        );

      doc.end();
    });
  }
}
