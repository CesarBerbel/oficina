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

const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);

const brl = (n: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

const dt = (d: Date | null): string =>
  d ? new Intl.DateTimeFormat('pt-BR').format(d) : '—';

const onlyDigits = (value: string | null | undefined): string =>
  (value ?? '').replace(/\D/g, '');

const maskPhone = (value: string | null | undefined): string => {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const maskCpfCnpj = (value: string | null | undefined): string => {
  const digits = onlyDigits(value);
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return value ?? '';
};

interface ShopInfo {
  name: string;
  cnpj: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  pdfFooterText: string | null;
}

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
      pdfFooterText: settings?.pdfFooterText || null,
    };
    const logo = await this.fetchLogo(settings?.logoPdfUrl || settings?.logoUrl || null);

    const buffer = await this.render(order, shop, logo);
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

  private render(
    order: Prisma.ServiceOrderGetPayload<{
      include: {
        tenant: { select: { name: true; cnpj: true } };
        customer: true;
        vehicle: true;
        items: true;
      };
    }>,
    shop: ShopInfo,
    logo: Buffer | null,
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
      const line = (y: number) =>
        doc.moveTo(left, y).lineTo(right, y).strokeColor('#e5e7eb').stroke();

      // Cabecalho: reserva colunas independentes para evitar sobreposicao
      // entre dados da empresa e identificacao da ordem de servico.
      const headerTop = 38;
      // Coluna da OS mais compacta e área central mais larga para evitar
      // corte no endereço/contatos da oficina no cabeçalho do PDF.
      const rightBlockW = 112;
      const headerGap = 8;
      const companyBlockW = width - rightBlockW - headerGap;
      const logoW = 112;
      const logoH = 68;
      let companyTextX = left;
      let companyTextW = companyBlockW;
      let logoBottom = headerTop;

      if (logo) {
        try {
          doc.image(logo, left, headerTop, { fit: [logoW, logoH] });
          companyTextX = left + logoW + 14;
          companyTextW = Math.max(260, companyBlockW - logoW - 14);
          logoBottom = headerTop + logoH;
        } catch {
          companyTextX = left;
          companyTextW = companyBlockW;
        }
      }

      const compact = (value: string | null | undefined): string =>
        (value ?? '').replace(/\s+/g, ' ').trim();

      const truncateToWidth = (text: string, maxWidth: number): string => {
        if (doc.widthOfString(text) <= maxWidth) return text;
        const suffix = '...';
        let out = text;
        while (out.length > 0 && doc.widthOfString(`${out}${suffix}`) > maxWidth) {
          out = out.slice(0, -1);
        }
        return `${out.trimEnd()}${suffix}`;
      };

      const oneLine = (
        text: string | null | undefined,
        x: number,
        yy: number,
        opts: { width: number; font: string; size: number; minSize: number; color: string; gap?: number },
      ): number => {
        const value = compact(text);
        if (!value) return yy;
        let size = opts.size;
        doc.font(opts.font).fontSize(size);
        while (size > opts.minSize && doc.widthOfString(value) > opts.width) {
          size -= 0.5;
          doc.fontSize(size);
        }
        const fitted = truncateToWidth(value, opts.width);
        doc.fillColor(opts.color).font(opts.font).fontSize(size).text(fitted, x, yy, {
          width: opts.width,
          lineBreak: false,
        });
        return yy + size + (opts.gap ?? 4);
      };

      let companyY = headerTop + 1;
      companyY = oneLine(shop.name, companyTextX, companyY, {
        width: companyTextW,
        font: 'Helvetica-Bold',
        size: 15.5,
        minSize: 10,
        color: dark,
        gap: 7,
      });
      companyY = oneLine(shop.address, companyTextX, companyY, {
        width: companyTextW,
        font: 'Helvetica',
        size: 8,
        minSize: 6.1,
        color: gray,
        gap: 4,
      });

      const contactParts = [
        compact(shop.phone) ? `Tel.: ${maskPhone(shop.phone)}` : null,
        compact(shop.whatsapp) && compact(shop.whatsapp) !== compact(shop.phone)
          ? `WhatsApp: ${maskPhone(shop.whatsapp)}`
          : null,
        compact(shop.email) || null,
      ].filter(Boolean) as string[];
      companyY = oneLine(contactParts.join(' | '), companyTextX, companyY, {
        width: companyTextW,
        font: 'Helvetica',
        size: 7.6,
        minSize: 5.6,
        color: gray,
        gap: 0,
      });
      const companyBottom = companyY;

      const orderBlockX = right - rightBlockW;
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(gray)
        .text('ORDEM DE SERVICO', orderBlockX, headerTop + 1, {
          width: rightBlockW,
          align: 'right',
        });
      doc
        .fontSize(17)
        .font('Helvetica-Bold')
        .fillColor(dark)
        .text(`Nº ${order.number}`, orderBlockX, doc.y + 2, {
          width: rightBlockW,
          align: 'right',
        });
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(gray)
        .text('Via do cliente', orderBlockX, doc.y + 4, {
          width: rightBlockW,
          align: 'right',
        })
        .text(`Emissao: ${dt(new Date())}`, orderBlockX, doc.y + 2, {
          width: rightBlockW,
          align: 'right',
        });
      const orderBottom = doc.y;

      let y = Math.max(headerTop + 94, logoBottom + 12, companyBottom + 12, orderBottom + 12);
      line(y);
      y += 12;

      // ─── Cliente / Veículo (duas colunas) ───
      const colW = width / 2 - 10;
      const labelVal = (x: number, yy: number, label: string, val: string) => {
        doc.fontSize(8).font('Helvetica').fillColor(gray).text(label, x, yy);
        doc.fontSize(10).font('Helvetica').fillColor(dark).text(val || '—', x, yy + 10, { width: colW });
        return yy + 26;
      };

      doc.fontSize(11).font('Helvetica-Bold').fillColor(dark).text('CLIENTE', left, y);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(dark).text('VEÍCULO', left + colW + 20, y);
      let yc = y + 16;
      let yv = y + 16;
      yc = labelVal(left, yc, 'Nome', order.customer.name);
      yv = labelVal(left + colW + 20, yv, 'Placa', order.vehicle.plate);
      yc = labelVal(left, yc, 'Telefone', maskPhone(order.customer.phone ?? order.customer.whatsapp) || '—');
      yv = labelVal(left + colW + 20, yv, 'Fabricante / Modelo', `${order.vehicle.manufacturer} ${order.vehicle.model}`);
      yc = labelVal(left, yc, 'E-mail', order.customer.email ?? '—');
      yv = labelVal(left + colW + 20, yv, 'Ano / Combustível', `${order.vehicle.modelYear ?? '—'} / ${order.vehicle.fuel ?? '—'}`);
      yc = labelVal(left, yc, 'CPF/CNPJ', maskCpfCnpj(order.customer.document) || '—');
      yv = labelVal(left + colW + 20, yv, 'KM / Cor', `${order.km ?? order.vehicle.currentKm ?? '—'} / ${order.vehicle.color ?? '—'}`);

      y = Math.max(yc, yv) + 6;
      line(y);
      y += 12;

      // ─── Relato / Diagnóstico ───
      const block = (title: string, text: string) => {
        doc.fontSize(10).font('Helvetica-Bold').fillColor(dark).text(title, left, y);
        y = doc.y + 2;
        doc.fontSize(10).font('Helvetica').fillColor('#374151').text(text || '—', left, y, { width });
        y = doc.y + 10;
      };
      block('Problema relatado', order.reportedProblem);
      if (order.diagnosis) block('Diagnóstico', order.diagnosis);

      // ─── Tabela de itens ───
      const services = order.items.filter((i) => i.kind === 'SERVICE');
      const parts = order.items.filter((i) => i.kind === 'PART');

      const table = (title: string, rows: typeof order.items) => {
        if (rows.length === 0) return;
        doc.fontSize(10).font('Helvetica-Bold').fillColor(dark).text(title, left, y);
        y = doc.y + 4;
        // header
        doc.fontSize(8).font('Helvetica-Bold').fillColor(gray);
        doc.text('Descrição', left, y, { width: 280 });
        doc.text('Qtd', left + 290, y, { width: 40, align: 'right' });
        doc.text('Unit.', left + 340, y, { width: 80, align: 'right' });
        doc.text('Total', left + 430, y, { width: 85, align: 'right' });
        y += 12;
        line(y);
        y += 4;
        doc.fontSize(9).font('Helvetica').fillColor(dark);
        for (const it of rows) {
          if (y > 740) {
            doc.addPage();
            y = 40;
          }
          doc.text(it.description, left, y, { width: 280 });
          doc.text(String(dec(it.quantity)), left + 290, y, { width: 40, align: 'right' });
          doc.text(brl(dec(it.unitPrice)), left + 340, y, { width: 80, align: 'right' });
          doc.text(brl(dec(it.total)), left + 430, y, { width: 85, align: 'right' });
          y = doc.y + 4;
        }
        y += 6;
      };

      table('SERVIÇOS', services);
      table('PEÇAS', parts);

      // ─── Totais ───
      line(y);
      y += 8;
      const totalRow = (label: string, val: string, bold = false) => {
        doc
          .fontSize(bold ? 12 : 10)
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor(dark);
        doc.text(label, left + 290, y, { width: 130, align: 'right' });
        doc.text(val, left + 430, y, { width: 85, align: 'right' });
        y = doc.y + 4;
      };
      totalRow('Serviços', brl(dec(order.totalServices)));
      totalRow('Peças', brl(dec(order.totalParts)));
      if (dec(order.discount) > 0) totalRow('Desconto', `- ${brl(dec(order.discount))}`);
      y += 2;
      totalRow('TOTAL', brl(dec(order.total)), true);

      // ─── Garantia + assinatura ───
      y += 20;
      if (y > 680) {
        doc.addPage();
        y = 40;
      }
      const footerText =
        shop.pdfFooterText ||
        'Termos de garantia: os serviços executados pela oficina possuem garantia de 90 dias, nos termos do Código de Defesa do Consumidor. ' +
          'Peças fornecidas pela oficina seguem a garantia do fabricante. Peças fornecidas pelo cliente, serviços adicionais não autorizados e falhas não relacionadas a esta OS não são cobertos. ' +
          'O cliente declara ciência das informações, valores, observações e condições registradas neste documento.';

      doc.fontSize(8).font('Helvetica').fillColor(gray).text(footerText, left, y, {
        width,
        lineGap: 1,
      });
      y = doc.y + 40;
      doc.moveTo(left + 120, y).lineTo(right - 120, y).strokeColor('#9ca3af').stroke();
      doc
        .fontSize(9)
        .fillColor(gray)
        .text('Assinatura do cliente', left, y + 4, { width, align: 'center' });
      doc
        .fontSize(8)
        .fillColor(gray)
        .text('Data: ____/____/________', left, y + 18, { width, align: 'center' });

      doc.end();
    });
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
