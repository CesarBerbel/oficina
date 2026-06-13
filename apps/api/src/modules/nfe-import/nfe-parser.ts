import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';

export interface RawNfeItem {
  cProd: string | null;
  ean: string | null;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  total: number;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
}

export interface RawNfe {
  supplierCnpj: string | null;
  supplierName: string | null;
  items: RawNfeItem[];
}

type ParsedNfeProduct = {
  cEAN?: unknown;
  cEANTrib?: unknown;
  cProd?: unknown;
  xProd?: unknown;
  uCom?: unknown;
  uTrib?: unknown;
  qCom?: unknown;
  qTrib?: unknown;
  vUnCom?: unknown;
  vUnTrib?: unknown;
  vProd?: unknown;
  NCM?: unknown;
  CEST?: unknown;
  CFOP?: unknown;
};

type ParsedNfeDet = {
  prod?: ParsedNfeProduct;
};

const MAX_XML_FILES_PER_ZIP = 25;
const MAX_XML_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ZIP_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};
const num = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

function arrify<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function isZipBuffer(buffer: Buffer): boolean {
  return buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function looksLikeXml(buffer: Buffer): boolean {
  const prefix = buffer.subarray(0, 128).toString('utf8').trimStart();
  return prefix.startsWith('<');
}

function assertXmlSize(size: number, label: string): void {
  if (size > MAX_XML_FILE_BYTES) {
    throw new Error(
      `${label} excede o limite de ${MAX_XML_FILE_BYTES / 1024 / 1024} MB`,
    );
  }
}

function readXmlsFromZip(buffer: Buffer): string[] {
  const zip = new AdmZip(buffer);
  const xmls: string[] = [];
  let totalUncompressedBytes = 0;

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !entry.entryName.toLowerCase().endsWith('.xml')) {
      continue;
    }

    if (xmls.length >= MAX_XML_FILES_PER_ZIP) {
      throw new Error(
        `ZIP excede o limite de ${MAX_XML_FILES_PER_ZIP} arquivos XML`,
      );
    }

    const declaredSize = Number(
      (entry as { header?: { size?: number } }).header?.size ?? 0,
    );
    if (declaredSize > 0) {
      assertXmlSize(declaredSize, `XML ${entry.entryName}`);
      totalUncompressedBytes += declaredSize;
      if (totalUncompressedBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
        throw new Error(
          `ZIP excede o limite de ${MAX_ZIP_UNCOMPRESSED_BYTES / 1024 / 1024} MB descompactados`,
        );
      }
    }

    const data = entry.getData();
    assertXmlSize(data.length, `XML ${entry.entryName}`);

    if (declaredSize <= 0) {
      totalUncompressedBytes += data.length;
      if (totalUncompressedBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
        throw new Error(
          `ZIP excede o limite de ${MAX_ZIP_UNCOMPRESSED_BYTES / 1024 / 1024} MB descompactados`,
        );
      }
    }

    if (!looksLikeXml(data)) {
      throw new Error(`Arquivo ${entry.entryName} não parece ser XML`);
    }

    xmls.push(data.toString('utf8'));
  }

  if (xmls.length === 0) throw new Error('ZIP sem arquivos XML');
  return xmls;
}

function readSingleXml(buffer: Buffer, filename: string): string {
  if (!filename.toLowerCase().endsWith('.xml') && !looksLikeXml(buffer)) {
    throw new Error('Envie um arquivo .xml ou .zip válido');
  }

  assertXmlSize(buffer.length, 'XML');

  if (!looksLikeXml(buffer)) {
    throw new Error('Arquivo não parece ser XML');
  }

  return buffer.toString('utf8');
}

/** Lê um único XML de NF-e. */
function parseSingleXml(xml: string): RawNfe {
  const obj = parser.parse(xml);
  const infNFe = obj?.nfeProc?.NFe?.infNFe ?? obj?.NFe?.infNFe ?? null;
  if (!infNFe) {
    throw new Error('XML não parece ser uma NF-e válida');
  }

  const emit = infNFe.emit ?? {};
  const dets = arrify<ParsedNfeDet>(infNFe.det);

  const items: RawNfeItem[] = dets.map((det) => {
    const p = det.prod ?? {};
    const ean = str(p.cEAN) ?? str(p.cEANTrib);
    return {
      cProd: str(p.cProd),
      ean: ean && ean.toUpperCase() !== 'SEM GTIN' ? ean : null,
      name: str(p.xProd) ?? 'Item sem descrição',
      unit: str(p.uCom) ?? str(p.uTrib) ?? 'UN',
      quantity: num(p.qCom ?? p.qTrib),
      unitCost: num(p.vUnCom ?? p.vUnTrib),
      total: num(p.vProd),
      ncm: str(p.NCM),
      cest: str(p.CEST),
      cfop: str(p.CFOP),
    };
  });

  return {
    supplierCnpj: str(emit.CNPJ),
    supplierName: str(emit.xNome),
    items,
  };
}

/** Aceita um .xml ou um .zip com vários XMLs. Combina os itens. */
export function parseNfeBuffer(buffer: Buffer, filename: string): RawNfe {
  const lowerName = filename.toLowerCase();
  const isZip = lowerName.endsWith('.zip') || isZipBuffer(buffer);

  const xmls = isZip ? readXmlsFromZip(buffer) : [readSingleXml(buffer, filename)];
  const parsed = xmls.map(parseSingleXml);

  return {
    supplierCnpj: parsed[0]?.supplierCnpj ?? null,
    supplierName: parsed[0]?.supplierName ?? null,
    items: parsed.flatMap((p) => p.items),
  };
}
