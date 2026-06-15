import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';

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

export interface ShopInfo {
  name: string;
  cnpj: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  pdfFooterText: string | null;
}

export function renderServiceOrderPdf(
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
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const left = 42;
    const right = pageW - 42;
    const width = right - left;
    const ink = '#111111';
    const softInk = '#333333';
    const muted = '#666666';
    const light = '#e5e5e5';
    const pale = '#f6f6f6';
    const white = '#ffffff';

    const compact = (value: string | null | undefined): string =>
      (value ?? '').replace(/\s+/g, ' ').trim();

    const money = (value: Prisma.Decimal | number | null | undefined): string => brl(dec(value));

    const fitText = (text: string, maxWidth: number): string => {
      if (doc.widthOfString(text) <= maxWidth) return text;
      const suffix = '...';
      let out = text;
      while (out.length > 0 && doc.widthOfString(`${out}${suffix}`) > maxWidth) {
        out = out.slice(0, -1);
      }
      return `${out.trimEnd()}${suffix}`;
    };


    const sanitizePrintText = (text: string): string =>
      text
        .replace(/\r/g, '')
        .replace(/\*\*/g, '')
        .replace(/\t/g, ' ')
        .replace(/\uFFFD/g, '?')
        .replace(/transpar\?+ncia/gi, 'transparencia')
        .replace(/servi\?+os/gi, 'servicos')
        .replace(/condi\?+\?+es/gi, 'condicoes')
        .replace(/Mec\?+nica/gi, 'Mecanica')
        .replace(/N\?+o/g, 'Nao')
        .replace(/n\?+o/g, 'nao')
        .replace(/pe\?+as/gi, 'pecas')
        .replace(/necess\?+rio/gi, 'necessario')
        .replace(/raz\?+o/gi, 'razao')
        .replace(/ve\?+culo/gi, 'veiculo')
        .replace(/dever\?+/gi, 'devera')
        .replace(/an\?+lise/gi, 'analise')
        .replace(/poss\?+vel/gi, 'possivel')
        .replace(/poss\?+veis/gi, 'possiveis')
        .replace(/t\?+cnica/gi, 'tecnica')
        .replace(/per\?+odo/gi, 'periodo')
        .replace(/manuten\?+\?+o/gi, 'manutencao')
        .replace(/interven\?+\?+o/gi, 'intervencao')
        .replace(/realiza\?+\?+o/gi, 'realizacao')
        .replace(/confian\?+a/gi, 'confianca')
        .replace(/direito \?+ garantia/gi, 'direito a garantia')
        .replace(/ser\?+/gi, 'sera')
        .replace(/\?{2,}/g, '')
        .replace(/[ \u00A0]+/g, ' ')
        .trim();

    const strokeLine = (x1: number, y1: number, x2: number, y2: number, color = light): void => {
      doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(0.6).strokeColor(color).stroke();
      doc.lineWidth(1);
    };

    const labelValue = (
      x: number,
      yy: number,
      w: number,
      label: string,
      value: string | number | null | undefined,
    ): void => {
      const text = value == null || value === '' ? '-' : String(value);
      doc.font('Helvetica-Bold').fontSize(7).fillColor(muted).text(label.toUpperCase(), x, yy, {
        width: w,
        lineBreak: false,
      });
      doc.font('Helvetica').fontSize(9).fillColor(ink).text(fitText(text, w), x, yy + 10, {
        width: w,
        lineBreak: false,
      });
    };

    const sectionTitle = (title: string, yy: number): number => {
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(ink).text(title.toUpperCase(), left, yy, {
        width,
        characterSpacing: 0.4,
      });
      strokeLine(left, yy + 15, right, yy + 15, '#bdbdbd');
      return yy + 25;
    };

    const drawHeader = (): number => {
      doc.rect(0, 0, pageW, pageH).fillColor(white).fill();

      const top = 34;
      const logoW = 105;
      const logoH = 52;
      let textX = left;
      if (logo) {
        try {
          doc.save();
          doc.rect(left, top, logoW, logoH).strokeColor('#d4d4d4').lineWidth(0.5).stroke();
          doc.image(logo, left + 8, top + 7, {
            fit: [logoW - 16, logoH - 14],
            align: 'center',
            valign: 'center',
          });
          doc.restore();
          textX = left + logoW + 18;
        } catch {
          textX = left;
        }
      }

      const numberBoxW = 150;
      const textW = right - textX - numberBoxW - 20;
      doc.font('Helvetica-Bold').fontSize(14.5).fillColor(ink).text(fitText(shop.name, textW), textX, top + 1, {
        width: textW,
        lineBreak: false,
      });

      const contactLine = [
        compact(shop.address),
        compact(shop.cnpj) ? `CNPJ: ${maskCpfCnpj(shop.cnpj)}` : null,
        compact(shop.phone) ? `Tel.: ${maskPhone(shop.phone)}` : null,
        compact(shop.whatsapp) && compact(shop.whatsapp) !== compact(shop.phone)
          ? `WhatsApp: ${maskPhone(shop.whatsapp)}`
          : null,
        compact(shop.email) || null,
      ]
        .filter(Boolean)
        .join('  |  ');

      doc.font('Helvetica').fontSize(7.5).fillColor(muted).text(contactLine || '-', textX, top + 20, {
        width: textW,
        lineGap: 2,
      });

      const boxX = right - numberBoxW;
      doc.rect(boxX, top, numberBoxW, 58).strokeColor('#999999').lineWidth(0.8).stroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor(muted).text('ORDEM DE SERVIÇO', boxX + 10, top + 10, {
        width: numberBoxW - 20,
        align: 'right',
      });
      doc.font('Helvetica-Bold').fontSize(20).fillColor(ink).text(`Nº ${order.number}`, boxX + 10, top + 24, {
        width: numberBoxW - 20,
        align: 'right',
      });
      doc.font('Helvetica').fontSize(7.5).fillColor(muted).text(`Emissão: ${dt(new Date())}`, boxX + 10, top + 46, {
        width: numberBoxW - 20,
        align: 'right',
      });

      strokeLine(left, top + 72, right, top + 72, '#111111');
      doc.font('Helvetica').fontSize(7.2).fillColor(muted).text(
        'Documento para autorização, acompanhamento técnico, conferência de valores, garantia e assinatura do cliente.',
        left,
        top + 79,
        { width, align: 'center' },
      );
      strokeLine(left, top + 95, right, top + 95, light);
      return top + 112;
    };

    let y = drawHeader();

    const ensure = (needed = 80): void => {
      if (y + needed <= pageH - 58) return;
      doc.addPage();
      y = drawHeader();
    };

    const twoColumnBlock = (
      titleLeft: string,
      leftRows: Array<[string, string | number | null | undefined]>,
      titleRight: string,
      rightRows: Array<[string, string | number | null | undefined]>,
    ): void => {
      ensure(120);
      const colGap = 20;
      const colW = (width - colGap) / 2;
      y = sectionTitle(`${titleLeft} / ${titleRight}`, y);
      doc.rect(left, y, width, 100).strokeColor(light).lineWidth(0.7).stroke();
      strokeLine(left + colW + colGap / 2, y, left + colW + colGap / 2, y + 100, light);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ink).text(titleLeft.toUpperCase(), left + 12, y + 12);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ink).text(titleRight.toUpperCase(), left + colW + colGap + 12, y + 12);

      const drawRows = (x: number, rows: Array<[string, string | number | null | undefined]>) => {
        const rowW = colW - 24;
        let rowY = y + 30;
        rows.forEach(([label, value], index) => {
          const w = index % 2 === 0 ? rowW * 0.57 : rowW * 0.43;
          const xx = index % 2 === 0 ? x : x + rowW * 0.57 + 10;
          labelValue(xx, rowY, w - 10, label, value);
          if (index % 2 === 1) rowY += 30;
        });
      };
      drawRows(left + 12, leftRows);
      drawRows(left + colW + colGap + 12, rightRows);
      y += 116;
    };

    const customerRows: Array<[string, string]> = [
      ['Nome', order.customer.name],
      ['CPF/CNPJ', maskCpfCnpj(order.customer.document) || '-'],
      ['Telefone', maskPhone(order.customer.phone ?? order.customer.whatsapp) || '-'],
      ['E-mail', order.customer.email ?? '-'],
      ['Cadastro', dt(order.customer.createdAt)],
      ['Código', order.customer.id.slice(0, 8)],
    ];
    const vehicleRows: Array<[string, string | number | null | undefined]> = [
      ['Placa', order.vehicle.plate],
      ['KM', order.km ?? order.vehicle.currentKm ?? '-'],
      ['Marca', order.vehicle.manufacturer],
      ['Modelo', order.vehicle.model],
      ['Ano', order.vehicle.modelYear ?? '-'],
      ['Cor', order.vehicle.color ?? '-'],
    ];
    twoColumnBlock('Cliente', customerRows, 'Veículo', vehicleRows);

    const textPanel = (title: string, text: string | null, minHeight = 74): void => {
      const value = compact(text) || '-';
      const textH = doc.heightOfString(value, { width: width - 26, lineGap: 2 });
      const h = Math.max(minHeight, textH + 44);
      ensure(h + 12);
      y = sectionTitle(title, y);
      doc.rect(left, y, width, h).strokeColor(light).lineWidth(0.7).stroke();
      doc.font('Helvetica').fontSize(9.2).fillColor(softInk).text(value, left + 13, y + 13, {
        width: width - 26,
        lineGap: 2,
      });
      y += h + 16;
    };

    textPanel('Relato do cliente', order.reportedProblem, 78);
    textPanel('Diagnóstico técnico', order.diagnosis, 78);

    const services = order.items.filter((i) => i.kind === 'SERVICE');
    const parts = order.items.filter((i) => i.kind === 'PART');

    const drawTableHeader = (title: string): void => {
      y = sectionTitle(title, y);
      doc.rect(left, y, width, 22).fillColor(pale).fill();
      doc.rect(left, y, width, 22).strokeColor('#cfcfcf').lineWidth(0.7).stroke();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(ink);
      doc.text('ITEM', left + 8, y + 7, { width: 30 });
      doc.text('DESCRIÇÃO', left + 42, y + 7, { width: 280 });
      doc.text('QTD', left + 330, y + 7, { width: 38, align: 'right' });
      doc.text('UNITÁRIO', left + 378, y + 7, { width: 70, align: 'right' });
      doc.text('TOTAL', left + 458, y + 7, { width: right - left - 466, align: 'right' });
      y += 22;
    };

    const itemTable = (title: string, rows: typeof order.items): void => {
      ensure(72);
      drawTableHeader(title);
      if (rows.length === 0) {
        doc.rect(left, y, width, 28).strokeColor(light).lineWidth(0.6).stroke();
        doc.font('Helvetica').fontSize(8.8).fillColor(muted).text('Nenhum item informado.', left + 10, y + 9);
        y += 44;
        return;
      }
      rows.forEach((it, index) => {
        const description = compact(it.description) || '-';
        const descH = doc.heightOfString(description, { width: 280, lineGap: 1 });
        const rowH = Math.max(28, descH + 15);
        ensure(rowH + 48);
        if (y < 160) drawTableHeader(`${title} - continuação`);
        doc.rect(left, y, width, rowH).strokeColor(light).lineWidth(0.5).stroke();
        doc.font('Helvetica').fontSize(8.5).fillColor(ink).text(String(index + 1).padStart(2, '0'), left + 8, y + 9, {
          width: 30,
        });
        doc.font('Helvetica').fontSize(8.7).fillColor(ink).text(description, left + 42, y + 8, {
          width: 280,
          lineGap: 1,
        });
        doc.font('Helvetica').fontSize(8.7).fillColor(softInk);
        doc.text(String(dec(it.quantity)), left + 330, y + 8, { width: 38, align: 'right' });
        doc.text(money(it.unitPrice), left + 378, y + 8, { width: 70, align: 'right' });
        doc.font('Helvetica-Bold').fillColor(ink).text(money(it.total), left + 458, y + 8, {
          width: right - left - 466,
          align: 'right',
        });
        y += rowH;
      });
      y += 16;
    };

    itemTable('Serviços autorizados / executados', services);
    itemTable('Peças e materiais aplicados', parts);

    ensure(80);
    y = sectionTitle('Condições e garantia', y);
    const footerText = sanitizePrintText(
      shop.pdfFooterText ||
        `CARO CLIENTE,

Prezando pelo bom relacionamento e pela transparencia em nossos servicos, informamos abaixo algumas condicoes importantes sobre garantia e atendimento:

* A Auto Mecanica Bandeirantes oferece garantia de 90 dias para todos os servicos executados pela oficina;
* Nao fornecemos garantia para pecas adquiridas diretamente pelo cliente;
* Caso seja necessario executar um novo servico em razao de defeito ou problema em peca fornecida pelo cliente, o servico sera cobrado;
* Pecas adquiridas diretamente na oficina possuem garantia de 90 dias;
* Em caso de necessidade de acionamento da garantia, o cliente devera entrar em contato conosco para agendar a analise e o possivel reparo;
* Para assegurar o direito a garantia, o veiculo passara por uma analise tecnica, a fim de identificar as possiveis causas do problema relatado;
* A realizacao de manutencao, reparo ou intervencao no veiculo por outro profissional ou oficina durante o periodo de garantia podera invalidar a garantia concedida.

Agradecemos a confianca em nosso trabalho.

AUTO MECANICA BANDEIRANTES`,
    );

    const drawParagraphText = (text: string): void => {
      const paragraphs = text.split('\n').map((line) => line.trim()).filter(Boolean);
      doc.font('Helvetica').fontSize(8.2).fillColor(softInk);
      paragraphs.forEach((paragraph) => {
        const isBullet = paragraph.startsWith('*');
        const clean = isBullet ? paragraph.replace(/^\*\s*/, '') : paragraph;
        const x = isBullet ? left + 15 : left;
        const w = isBullet ? width - 15 : width;
        const prefixW = isBullet ? 9 : 0;
        const h = doc.heightOfString(clean, { width: w - prefixW, lineGap: 2 });
        ensure(h + 12);
        if (isBullet) {
          doc.font('Helvetica').fontSize(8.2).fillColor(softInk).text('-', x, y, {
            width: prefixW,
            lineBreak: false,
          });
          doc.text(clean, x + prefixW, y, { width: w - prefixW, lineGap: 2 });
        } else {
          doc.text(clean, x, y, { width: w, lineGap: 2 });
        }
        y += h + 7;
      });
    };

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ink).text('TERMO DE GARANTIA E AUTORIZAÇÃO', left, y, {
      width,
    });
    y += 16;
    drawParagraphText(footerText);
    y += 8;

    ensure(92);
    y = sectionTitle('Resumo financeiro', y);
    const summaryH = 86;
    doc.rect(left, y, width, summaryH).strokeColor('#999999').lineWidth(0.8).stroke();
    const rowLeft = left + 14;
    const rowValueX = right - 170;
    const totalRow = (label: string, value: string, yy: number, strong = false): void => {
      doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 12 : 9).fillColor(ink).text(label, rowLeft, yy, {
        width: 160,
      });
      doc.font('Helvetica-Bold').fontSize(strong ? 12 : 9).fillColor(ink).text(value, rowValueX, yy, {
        width: 156,
        align: 'right',
      });
    };
    totalRow('Serviços', money(order.totalServices), y + 13);
    totalRow('Peças', money(order.totalParts), y + 31);
    totalRow('Desconto', dec(order.discount) > 0 ? `- ${money(order.discount)}` : money(0), y + 49);
    strokeLine(left + 14, y + 65, right - 14, y + 65, '#999999');
    totalRow('TOTAL', money(order.total), y + 69, true);
    y += summaryH + 20;

    ensure(104);
    y = sectionTitle('Assinaturas', y);
    doc.rect(left, y, width, 82).strokeColor(light).lineWidth(0.7).stroke();
    strokeLine(left + 45, y + 47, left + width / 2 - 28, y + 47, '#777777');
    strokeLine(left + width / 2 + 28, y + 47, right - 45, y + 47, '#777777');
    doc.font('Helvetica').fontSize(8).fillColor(muted).text('Cliente ou responsável', left + 45, y + 54, {
      width: width / 2 - 73,
      align: 'center',
    });
    doc.font('Helvetica').fontSize(8).fillColor(muted).text('Responsável técnico / oficina', left + width / 2 + 28, y + 54, {
      width: width / 2 - 73,
      align: 'center',
    });
    doc.font('Helvetica').fontSize(7.3).fillColor(muted).text(
      'Declaro estar ciente dos serviços, valores, condições de garantia e informações registradas nesta ordem de serviço.',
      left + 14,
      y + 68,
      { width: width - 28, align: 'center' },
    );

    const addFooters = (): void => {
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i += 1) {
        doc.switchToPage(i);
        strokeLine(left, pageH - 36, right, pageH - 36, light);
        doc.font('Helvetica').fontSize(7.2).fillColor(muted).text(`OS Nº ${order.number} - ${shop.name}`, left, pageH - 25, {
          width: width / 2,
        });
        doc.font('Helvetica').fontSize(7.2).fillColor(muted).text(`Página ${i + 1} de ${range.count}`, left + width / 2, pageH - 25, {
          width: width / 2,
          align: 'right',
        });
      }
    };

    addFooters();
    doc.end();
  });
}

