import { XMLParser } from 'fast-xml-parser';
import AdmZip from 'adm-zip';

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

/** Lê um único XML de NF-e. */
function parseSingleXml(xml: string): RawNfe {
  const obj = parser.parse(xml);
  const infNFe = obj?.nfeProc?.NFe?.infNFe ?? obj?.NFe?.infNFe ?? null;
  if (!infNFe) {
    throw new Error('XML não parece ser uma NF-e válida');
  }

  const emit = infNFe.emit ?? {};
  const dets = arrify<any>(infNFe.det);

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
  const isZip =
    filename.toLowerCase().endsWith('.zip') ||
    (buffer.length > 2 && buffer[0] === 0x50 && buffer[1] === 0x4b); // 'PK'

  const xmls: string[] = [];
  if (isZip) {
    const zip = new AdmZip(buffer);
    for (const entry of zip.getEntries()) {
      if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.xml')) {
        xmls.push(entry.getData().toString('utf8'));
      }
    }
    if (xmls.length === 0) throw new Error('ZIP sem arquivos XML');
  } else {
    xmls.push(buffer.toString('utf8'));
  }

  const parsed = xmls.map(parseSingleXml);
  return {
    supplierCnpj: parsed[0]?.supplierCnpj ?? null,
    supplierName: parsed[0]?.supplierName ?? null,
    items: parsed.flatMap((p) => p.items),
  };
}
