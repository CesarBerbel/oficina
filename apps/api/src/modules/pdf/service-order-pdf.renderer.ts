import { Prisma } from '@prisma/client';
import { SERVICE_ORDER_STATUS_LABELS } from '@oficina/shared';
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
  addressZip: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressDistrict: string | null;
  addressCity: string | null;
  addressState: string | null;
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
    const left = 40;
    const right = pageW - 40;
    const width = right - left;

    // Paleta profissional (slate) com um único tom de destaque.
    const ink = '#0f172a';
    const softInk = '#334155';
    const muted = '#64748b';
    const line = '#e2e8f0';
    const zebra = '#f1f5f9';
    const accent = '#1f2937';
    const white = '#ffffff';

    const compact = (value: string | null | undefined): string =>
      (value ?? '').replace(/\s+/g, ' ').trim();

    const money = (value: Prisma.Decimal | number | null | undefined): string =>
      brl(dec(value));

    const statusLabel = String(
      (SERVICE_ORDER_STATUS_LABELS as Record<string, string>)[order.status] ??
        order.status,
    );

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
        .replace(/�/g, '')
        .replace(/[  ]+/g, ' ')
        .trim();

    const strokeLine = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      color = line,
    ): void => {
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
      doc
        .font('Helvetica-Bold')
        .fontSize(6)
        .fillColor(muted)
        .text(label.toUpperCase(), x, yy, {
          width: w,
          lineBreak: false,
          characterSpacing: 0.3,
        });
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(ink)
        .text(fitText(text, w), x, yy + 8, { width: w, lineBreak: false });
    };

    const sectionTitle = (title: string, yy: number): number => {
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(accent)
        .text(title.toUpperCase(), left, yy, { width, characterSpacing: 0.6 });
      strokeLine(left, yy + 12, right, yy + 12, line);
      return yy + 20;
    };

    const drawHeader = (): number => {
      doc.rect(0, 0, pageW, pageH).fillColor(white).fill();
      // Faixa de destaque no topo.
      doc.rect(0, 0, pageW, 5).fillColor(accent).fill();

      const top = 24;
      const numberBoxW = 128;
      const numberBoxH = 46;
      const logoW = 58;
      const logoH = 44;
      let textX = left;
      if (logo) {
        try {
          doc.image(logo, left, top, { fit: [logoW, logoH], valign: 'center' });
          textX = left + logoW + 12;
        } catch {
          textX = left;
        }
      }

      const boxX = right - numberBoxW;
      const textW = boxX - textX - 14;

      // Nome da oficina + contatos (alinhados à esquerda, em 4 linhas).
      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor(ink)
        .text(fitText(shop.name, textW), textX, top, { width: textW, lineBreak: false });

      // Endereço em duas linhas a partir das partes (fallback: campo composto).
      const addrLine1 =
        [
          [compact(shop.addressStreet), compact(shop.addressNumber)]
            .filter(Boolean)
            .join(', '),
          compact(shop.addressComplement),
          compact(shop.addressDistrict),
        ]
          .filter(Boolean)
          .join(', ') || null;
      const addrLine2 =
        [
          compact(shop.addressZip) ? `CEP ${compact(shop.addressZip)}` : null,
          [compact(shop.addressCity), compact(shop.addressState)]
            .filter(Boolean)
            .join('/'),
        ]
          .filter(Boolean)
          .join(' - ') || null;
      const addressLines =
        addrLine1 || addrLine2 ? [addrLine1, addrLine2] : [compact(shop.address) || '-'];

      let cy = top + 17;
      for (const ln of addressLines.filter(Boolean)) {
        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor(muted)
          .text(ln as string, textX, cy, { width: textW, lineBreak: false });
        cy = doc.y + 1.5;
      }

      const telLine =
        [
          compact(shop.phone) ? `Tel.: ${maskPhone(shop.phone)}` : null,
          compact(shop.whatsapp) ? `WhatsApp: ${maskPhone(shop.whatsapp)}` : null,
        ]
          .filter(Boolean)
          .join('   ·   ') || '-';
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(muted)
        .text(telLine, textX, cy, { width: textW, lineBreak: false });
      cy = doc.y + 1.5;

      const docLine =
        [
          compact(shop.cnpj) ? `CNPJ: ${maskCpfCnpj(shop.cnpj)}` : null,
          compact(shop.email) || null,
        ]
          .filter(Boolean)
          .join('   ·   ') || '-';
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(muted)
        .text(docLine, textX, cy, { width: textW, lineBreak: false });
      cy = doc.y;

      // Caixa da OS (menor).
      doc.roundedRect(boxX, top, numberBoxW, numberBoxH, 4).fillColor(accent).fill();
      doc
        .font('Helvetica-Bold')
        .fontSize(6.5)
        .fillColor('#cbd5e1')
        .text('ORDEM DE SERVIÇO', boxX + 10, top + 7, {
          width: numberBoxW - 20,
          align: 'right',
          characterSpacing: 0.4,
        });
      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor(white)
        .text(`Nº ${order.number}`, boxX + 10, top + 17, {
          width: numberBoxW - 20,
          align: 'right',
        });
      doc
        .font('Helvetica')
        .fontSize(6.2)
        .fillColor('#cbd5e1')
        .text(`Emissão: ${dt(new Date())}`, boxX + 10, top + 35, {
          width: numberBoxW - 20,
          align: 'right',
        });

      let hy = Math.max(cy, top + numberBoxH, top + (logo ? logoH : 0)) + 12;

      // Tira de metadados (abertura / previsão / status).
      const metaH = 20;
      doc.roundedRect(left, hy, width, metaH, 4).fillColor(zebra).fill();
      const metaItems: Array<[string, string]> = [
        ['Abertura', dt(order.openedAt)],
        ['Previsão', dt(order.dueDate)],
        ['Status', statusLabel],
      ];
      const metaColW = width / metaItems.length;
      metaItems.forEach(([label, value], i) => {
        const mx = left + i * metaColW + 12;
        if (i > 0) {
          strokeLine(
            left + i * metaColW,
            hy + 4,
            left + i * metaColW,
            hy + metaH - 4,
            '#cbd5e1',
          );
        }
        doc
          .font('Helvetica-Bold')
          .fontSize(6)
          .fillColor(muted)
          .text(label.toUpperCase(), mx, hy + 5, {
            lineBreak: false,
            characterSpacing: 0.3,
          });
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor(ink)
          .text(fitText(value, metaColW - 66), mx + 48, hy + 5.5, { lineBreak: false });
      });
      hy += metaH + 12;
      return hy;
    };

    let y = drawHeader();

    const ensure = (needed = 80): void => {
      if (y + needed <= pageH - 46) return;
      doc.addPage();
      y = drawHeader();
    };

    // ─── Rodapé rich text (HTML simples: b/i/u, br, p, ul/ol/li) ───
    const decodeEntities = (s: string): string =>
      s
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#3?9;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');

    type RichRun = { text: string; bold: boolean; italic: boolean; underline: boolean };
    type RichLine = { runs: RichRun[]; prefix?: string };

    const parseRichHtml = (html: string): RichLine[] => {
      const lines: RichLine[] = [];
      let runs: RichRun[] = [];
      let bold = 0;
      let italic = 0;
      let underline = 0;
      let listType: 'ul' | 'ol' | null = null;
      let listIndex = 0;
      let inLi = false;
      const flush = (asItem = false): void => {
        // Limpa cada trecho SEM trim (preserva os espaços entre trechos com
        // formatações diferentes); só apara o início/fim da linha inteira.
        let clean = runs
          .map((r) => ({
            ...r,
            text: r.text.replace(/\r/g, '').replace(/�/g, '').replace(/[  ]+/g, ' '),
          }))
          .filter((r) => r.text !== '');
        if (clean.length) {
          clean[0] = { ...clean[0], text: clean[0].text.replace(/^ +/, '') };
          const last = clean.length - 1;
          clean[last] = { ...clean[last], text: clean[last].text.replace(/ +$/, '') };
          clean = clean.filter((r) => r.text !== '');
        }
        if (clean.length === 0 && !asItem) {
          runs = [];
          return;
        }
        lines.push({
          runs: clean.length
            ? clean
            : [{ text: '', bold: false, italic: false, underline: false }],
          prefix: asItem ? (listType === 'ol' ? `${listIndex}.` : '•') : undefined,
        });
        runs = [];
      };
      const re = /<\/?([a-z0-9]+)[^>]*>|([^<]+)/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html))) {
        if (m[2] != null) {
          const text = decodeEntities(m[2]);
          if (text) {
            runs.push({ text, bold: bold > 0, italic: italic > 0, underline: underline > 0 });
          }
          continue;
        }
        const tag = m[1].toLowerCase();
        const closing = m[0].startsWith('</');
        if (tag === 'b' || tag === 'strong') bold = Math.max(0, bold + (closing ? -1 : 1));
        else if (tag === 'i' || tag === 'em') italic = Math.max(0, italic + (closing ? -1 : 1));
        else if (tag === 'u') underline = Math.max(0, underline + (closing ? -1 : 1));
        else if (tag === 'br' || tag === 'p' || tag === 'div') flush();
        else if (tag === 'ul' || tag === 'ol') {
          flush();
          if (!closing) {
            listType = tag;
            listIndex = 0;
          } else {
            listType = null;
          }
        } else if (tag === 'li') {
          if (!closing) {
            flush();
            inLi = true;
            if (listType === 'ol') listIndex += 1;
          } else {
            flush(true);
            inLi = false;
          }
        }
      }
      flush(inLi);
      return lines;
    };

    const richFont = (r: RichRun): string =>
      r.bold && r.italic
        ? 'Helvetica-BoldOblique'
        : r.bold
          ? 'Helvetica-Bold'
          : r.italic
            ? 'Helvetica-Oblique'
            : 'Helvetica';

    const renderRichFooter = (html: string, fs: number): void => {
      for (const lineItem of parseRichHtml(html)) {
        const hasPrefix = !!lineItem.prefix;
        const startX = hasPrefix ? left + 14 : left;
        const availW = right - startX;
        let sumW = 0;
        for (const r of lineItem.runs) {
          sumW += doc.font(richFont(r)).fontSize(fs).widthOfString(r.text);
        }
        const wrap = Math.max(1, Math.ceil(sumW / availW || 1));
        ensure(wrap * (fs + 1) + 3);
        if (hasPrefix) {
          doc
            .font('Helvetica')
            .fontSize(fs)
            .fillColor(muted)
            .text(lineItem.prefix as string, left, y, { width: 12, lineBreak: false });
        }
        if (lineItem.runs.length === 1 && lineItem.runs[0].text === '') {
          y += fs * 0.6;
          continue;
        }
        lineItem.runs.forEach((r, i) => {
          const isLast = i === lineItem.runs.length - 1;
          doc.font(richFont(r)).fontSize(fs).fillColor(softInk);
          if (i === 0) {
            doc.text(r.text, startX, y, {
              width: availW,
              continued: !isLast,
              underline: r.underline,
              lineGap: 0,
            });
          } else {
            doc.text(r.text, { continued: !isLast, underline: r.underline, lineGap: 0 });
          }
        });
        y = doc.y + 0.5;
      }
    };

    // ─── Cliente / Veículo (dois cards) ───
    const infoBlock = (
      titleLeft: string,
      leftRows: Array<[string, string | number | null | undefined]>,
      titleRight: string,
      rightRows: Array<[string, string | number | null | undefined]>,
    ): void => {
      const boxH = 74;
      ensure(boxH + 12);
      const colGap = 12;
      const colW = (width - colGap) / 2;

      const drawCard = (
        x: number,
        title: string,
        rows: Array<[string, string | number | null | undefined]>,
      ) => {
        doc.roundedRect(x, y, colW, boxH, 4).strokeColor(line).lineWidth(0.8).stroke();
        doc.roundedRect(x, y, colW, 16, 4).fillColor(zebra).fill();
        doc.rect(x, y + 8, colW, 8).fillColor(zebra).fill();
        doc
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .fillColor(accent)
          .text(title.toUpperCase(), x + 10, y + 4.5, { characterSpacing: 0.5 });
        const innerW = colW - 20;
        const cellW = (innerW - 10) / 2;
        let rowY = y + 22;
        rows.forEach(([label, value], index) => {
          const xx = index % 2 === 0 ? x + 10 : x + 10 + cellW + 10;
          labelValue(xx, rowY, cellW, label, value);
          if (index % 2 === 1) rowY += 24;
        });
      };

      drawCard(left, titleLeft, leftRows);
      drawCard(left + colW + colGap, titleRight, rightRows);
      y += boxH + 12;
    };

    infoBlock(
      'Cliente',
      [
        ['Nome', order.customer.name],
        ['CPF / CNPJ', maskCpfCnpj(order.customer.document) || '-'],
        ['Telefone', maskPhone(order.customer.phone ?? order.customer.whatsapp) || '-'],
        ['E-mail', order.customer.email ?? '-'],
      ],
      'Veículo',
      [
        ['Placa', order.vehicle.plate],
        ['KM', order.km ?? order.vehicle.currentKm ?? '-'],
        ['Marca / Modelo', `${order.vehicle.manufacturer} ${order.vehicle.model}`],
        ['Ano / Cor', `${order.vehicle.modelYear ?? '-'} · ${order.vehicle.color ?? '-'}`],
      ],
    );

    // ─── Relato / Diagnóstico (sem moldura) ───
    const textPanel = (title: string, text: string | null): void => {
      const value = compact(text) || '-';
      doc.font('Helvetica').fontSize(8);
      const textH = doc.heightOfString(value, { width, lineGap: 1.5 });
      ensure(textH + 22);
      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .fillColor(accent)
        .text(title.toUpperCase(), left, y, { characterSpacing: 0.5 });
      y += 11;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(softInk)
        .text(value, left, y, { width, lineGap: 1.5 });
      y += textH + 10;
    };

    textPanel('Diagnóstico técnico', order.diagnosis);

    // ─── Itens: serviços com suas peças vinculadas logo abaixo ───
    const allItems = order.items;
    const services = allItems.filter((i) => i.kind === 'SERVICE');
    const parts = allItems.filter((i) => i.kind === 'PART');
    const serviceIds = new Set(services.map((s) => s.id));
    const partsByParent = new Map<string, typeof parts>();
    const looseParts: typeof parts = [];
    for (const p of parts) {
      if (p.parentItemId && serviceIds.has(p.parentItemId)) {
        const arr = partsByParent.get(p.parentItemId) ?? [];
        arr.push(p);
        partsByParent.set(p.parentItemId, arr);
      } else {
        looseParts.push(p);
      }
    }
    const ordered: Array<{ it: (typeof allItems)[number]; linked: boolean }> = [];
    for (const s of services) {
      ordered.push({ it: s, linked: false });
      for (const p of partsByParent.get(s.id) ?? []) ordered.push({ it: p, linked: true });
    }
    for (const p of looseParts) ordered.push({ it: p, linked: false });

    const colItem = left + 6;
    const colDesc = left + 28;
    const descW = 256;
    const colType = left + 290;
    const colQtd = left + 336;
    const colUnit = left + 372;
    const colTotal = left + 442;
    const totalW = right - colTotal - 4;

    const drawItemsHeader = (): void => {
      doc.rect(left, y, width, 18).fillColor(accent).fill();
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(white);
      doc.text('#', colItem, y + 6, { width: 18 });
      doc.text('DESCRIÇÃO', colDesc, y + 6, { width: descW });
      doc.text('TIPO', colType, y + 6, { width: 44 });
      doc.text('QTD', colQtd, y + 6, { width: 32, align: 'right' });
      doc.text('UNITÁRIO', colUnit, y + 6, { width: 62, align: 'right' });
      doc.text('TOTAL', colTotal, y + 6, { width: totalW, align: 'right' });
      y += 18;
    };

    ensure(80);
    y = sectionTitle('Serviços e peças', y);
    drawItemsHeader();

    if (ordered.length === 0) {
      doc.rect(left, y, width, 24).strokeColor(line).lineWidth(0.6).stroke();
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(muted)
        .text('Nenhum item informado.', colDesc, y + 7);
      y += 24;
    } else {
      ordered.forEach(({ it, linked }, index) => {
        const prefix = linked ? '» ' : '';
        const dX = linked ? colDesc + 12 : colDesc;
        const dW = linked ? descW - 12 : descW;
        const description = `${prefix}${compact(it.description) || '-'}`;
        doc.font('Helvetica').fontSize(8);
        const descH = doc.heightOfString(description, { width: dW, lineGap: 0.5 });
        const rowH = Math.max(16, descH + 7);
        ensure(rowH + 4);
        if (index % 2 === 1) doc.rect(left, y, width, rowH).fillColor(zebra).fill();
        const ty = y + 4;
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(muted)
          .text(String(index + 1).padStart(2, '0'), colItem, ty, { width: 18 });
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(linked ? softInk : ink)
          .text(description, dX, ty, { width: dW, lineGap: 0.5 });
        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor(muted)
          .text(it.kind === 'SERVICE' ? 'Serviço' : 'Peça', colType, ty, { width: 44 });
        doc.font('Helvetica').fontSize(8).fillColor(softInk);
        doc.text(String(dec(it.quantity)), colQtd, ty, { width: 32, align: 'right' });
        doc.text(money(it.unitPrice), colUnit, ty, { width: 62, align: 'right' });
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor(ink)
          .text(money(it.total), colTotal, ty, { width: totalW, align: 'right' });
        y += rowH;
      });
    }
    strokeLine(left, y, right, y, line);
    y += 14;

    // ─── Resumo financeiro (horizontal) ───
    const sumH = 32;
    ensure(sumH + 12);
    const sTop = y;
    const totalBoxW = 170;
    const leftAreaW = width - totalBoxW;
    doc
      .roundedRect(left, sTop, width, sumH, 4)
      .strokeColor('#cbd5e1')
      .lineWidth(0.9)
      .stroke();

    const cells: Array<[string, string]> = [
      ['Serviços', money(order.totalServices)],
      ['Peças', money(order.totalParts)],
      ['Desconto', dec(order.discount) > 0 ? `- ${money(order.discount)}` : money(0)],
    ];
    const cellW = leftAreaW / cells.length;
    cells.forEach(([label, value], i) => {
      const cx = left + i * cellW + 12;
      if (i > 0) {
        strokeLine(left + i * cellW, sTop + 6, left + i * cellW, sTop + sumH - 6, line);
      }
      doc
        .font('Helvetica-Bold')
        .fontSize(6)
        .fillColor(muted)
        .text(label.toUpperCase(), cx, sTop + 7, { lineBreak: false, characterSpacing: 0.3 });
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(ink)
        .text(value, cx, sTop + 17, { lineBreak: false });
    });

    // Caixa do total (preenchida) à direita.
    const tboxX = left + leftAreaW;
    doc
      .roundedRect(tboxX, sTop + 1.5, totalBoxW - 2.5, sumH - 3, 3)
      .fillColor(accent)
      .fill();
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor('#cbd5e1')
      .text('TOTAL', tboxX + 12, sTop + 12, { lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(white)
      .text(money(order.total), tboxX + 12, sTop + 10, {
        width: totalBoxW - 24,
        align: 'right',
      });
    y = sTop + sumH + 16;

    // ─── Condições e garantia ───
    // O rodapé pode ser HTML simples (editor rich text) ou texto puro (legado).
    const footerRaw = (shop.pdfFooterText ?? '').trim();
    const footerIsHtml = /<\/?(b|strong|i|em|u|br|p|div|ul|ol|li)\b/i.test(footerRaw);
    const FS = 7.2;

    ensure(28);
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor(accent)
      .text('CONDIÇÕES E GARANTIA', left, y, { characterSpacing: 0.5 });
    y += 12;

    if (footerIsHtml) {
      renderRichFooter(footerRaw, FS);
    } else {
      const conditionsText = sanitizePrintText(
        footerRaw ||
          `Autorizo a execução dos serviços e a aplicação das peças relacionadas nesta ordem de serviço, conforme os valores apresentados.

Garantia de 90 dias para os serviços executados pela oficina. As peças têm garantia conforme o fabricante. Peças fornecidas pelo próprio cliente não possuem garantia da oficina. A garantia poderá ser invalidada por intervenção de terceiros durante o período de cobertura.`,
      );
      conditionsText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((paragraph) => {
          const isBullet = paragraph.startsWith('*') || paragraph.startsWith('-');
          const clean = paragraph.replace(/^[*-]\s*/, '');
          const textX = isBullet ? left + 10 : left;
          const w = isBullet ? width - 10 : width;
          doc.font('Helvetica').fontSize(FS).fillColor(softInk);
          const h = doc.heightOfString(clean, { width: w, lineGap: 0 });
          ensure(h + 3);
          if (isBullet) {
            doc.font('Helvetica').fontSize(FS).fillColor(muted).text('•', left, y, {
              width: 8,
              lineBreak: false,
            });
          }
          doc.font('Helvetica').fontSize(FS).fillColor(softInk).text(clean, textX, y, {
            width: w,
            lineGap: 0,
          });
          y += h + 1;
        });
    }
    y += 8;

    // ─── Assinaturas ───
    ensure(60);
    const sigY = y + 24;
    const sigW = width / 2 - 40;
    strokeLine(left + 20, sigY, left + 20 + sigW, sigY, '#94a3b8');
    strokeLine(right - 20 - sigW, sigY, right - 20, sigY, '#94a3b8');
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(muted)
      .text('Cliente ou responsável', left + 20, sigY + 5, { width: sigW, align: 'center' });
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(muted)
      .text('Responsável técnico / oficina', right - 20 - sigW, sigY + 5, {
        width: sigW,
        align: 'center',
      });

    const addFooters = (): void => {
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i += 1) {
        doc.switchToPage(i);
        strokeLine(left, pageH - 30, right, pageH - 30, line);
        doc
          .font('Helvetica')
          .fontSize(6.8)
          .fillColor(muted)
          .text(`OS Nº ${order.number} · ${shop.name}`, left, pageH - 22, {
            width: width / 2,
          });
        doc
          .font('Helvetica')
          .fontSize(6.8)
          .fillColor(muted)
          .text(`Página ${i + 1} de ${range.count}`, left + width / 2, pageH - 22, {
            width: width / 2,
            align: 'right',
          });
      }
    };

    addFooters();
    doc.end();
  });
}
