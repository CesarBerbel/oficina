'use client';

import { useRef, useState } from 'react';
import { Upload, FileCheck2, PackagePlus, Save } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  PART_TYPES,
  PART_TYPE_LABELS,
  PART_UNITS,
  PART_UNIT_LABELS,
  type NfeParseResult,
  type PartType,
} from '@oficina/shared';
import { parseNfe, useConfirmNfe } from '@/features/purchases/use-purchases';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MoneyInput, formatMoneyInputFromNumber, moneyInputToNumber } from '@/components/ui/money-input';

interface Row {
  include: boolean;
  partId?: string;
  matched: boolean;
  sku: string;
  ean: string;
  name: string;
  type: PartType;
  unit: string;
  quantity: string;
  costPrice: string;
  salePrice: string;
  minStock: string;
  ncm: string;
  cfop: string | null;
}

export default function NfeImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<NfeParseResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const confirm = useConfirmNfe();

  async function onFile(file: File) {
    setParsing(true);
    try {
      const parsed = await parseNfe(file);
      setResult(parsed);
      setRows(
        parsed.items.map((i) => ({
          include: true,
          partId: i.matchedPartId ?? undefined,
          matched: !!i.matchedPartId,
          sku: i.cProd ?? '',
          ean: i.ean ?? '',
          name: i.name,
          type: 'PECA',
          unit: PART_UNITS.includes(i.unit as (typeof PART_UNITS)[number]) ? i.unit : 'UN',
          quantity: String(i.quantity),
          costPrice: formatMoneyInputFromNumber(i.unitCost),
          salePrice: formatMoneyInputFromNumber(Math.round(i.unitCost * 1.6 * 100) / 100),
          minStock: '0',
          ncm: i.ncm ?? '',
          cfop: i.cfop,
        })),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao ler arquivo');
    } finally {
      setParsing(false);
    }
  }

  function setRow(idx: number, patch: Partial<Row>) {
    setRows((r) => r.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  async function doConfirm(registerStock: boolean) {
    const items = rows
      .filter((r) => r.include)
      .map((r) => ({
        include: true,
        partId: r.partId,
        sku: r.sku || undefined,
        ncm: r.ncm || undefined,
        ean: r.ean || undefined,
        name: r.name,
        type: r.type,
        unit: r.unit,
        quantity: r.quantity,
        costPrice: moneyInputToNumber(r.costPrice),
        salePrice: moneyInputToNumber(r.salePrice),
        minStock: r.minStock,
      }));
    if (items.length === 0) {
      toast.error('Selecione ao menos um item');
      return;
    }
    try {
      const res = await confirm.mutateAsync({
        items: items as never,
        registerStock,
        supplierName: result?.supplierName ?? undefined,
      });
      toast.success(
        `Importação concluída: ${res.created} criada(s), ${res.updated} atualizada(s)` +
          (registerStock ? `, ${res.stockEntries} entrada(s) de estoque` : ''),
      );
      setResult(null);
      setRows([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao importar');
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar NF-e</h1>
        <p className="text-muted-foreground">
          Envie um arquivo .xml ou .zip de NF-e para cadastrar peças e insumos.
        </p>
      </div>

      {!result ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Upload className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Selecione o XML da NF-e (ou um ZIP com vários)
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xml,.zip,application/xml,text/xml,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
          <Button className="mt-4" onClick={() => fileRef.current?.click()} disabled={parsing}>
            {parsing ? <CarLoader className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Escolher arquivo
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
            <div>
              <span className="font-medium">{result.fileName}</span>
              {result.supplierName && (
                <span className="text-muted-foreground">
                  {' '}· Fornecedor: {result.supplierName}
                  {result.supplierCnpj ? ` (${result.supplierCnpj})` : ''}
                  {result.matchedSupplierId && (
                    <Badge variant="success" className="ml-2">cadastrado</Badge>
                  )}
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setResult(null); setRows([]); }}>
              Trocar arquivo
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2"></th>
                  <th className="p-2 text-left">Nome</th>
                  <th className="p-2 text-left">Código</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-left">Unidade</th>
                  <th className="p-2 text-right">Qtd</th>
                  <th className="p-2 text-right">Custo</th>
                  <th className="p-2 text-right">Venda</th>
                  <th className="p-2 text-right">Mín.</th>
                  <th className="p-2 text-left">NCM/CFOP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">
                      <input type="checkbox" className="size-4" checked={r.include}
                        onChange={(e) => setRow(idx, { include: e.target.checked })} />
                    </td>
                    <td className="p-2 min-w-[180px]">
                      <Input value={r.name} onChange={(e) => setRow(idx, { name: e.target.value })} className="h-8" />
                      {r.matched && <Badge variant="warning" className="mt-1">atualiza existente</Badge>}
                    </td>
                    <td className="p-2"><Input value={r.sku} onChange={(e) => setRow(idx, { sku: e.target.value })} className="h-8 w-28" /></td>
                    <td className="p-2">
                      <Select value={r.type} onChange={(e) => setRow(idx, { type: e.target.value as PartType })} className="h-8 w-28">
                        {PART_TYPES.map((t) => <option key={t} value={t}>{PART_TYPE_LABELS[t]}</option>)}
                      </Select>
                    </td>
                    <td className="p-2">
                      <Select value={r.unit} onChange={(e) => setRow(idx, { unit: e.target.value })} className="h-8 w-32">
                        {PART_UNITS.map((unit) => <option key={unit} value={unit}>{unit} — {PART_UNIT_LABELS[unit]}</option>)}
                      </Select>
                    </td>
                    <td className="p-2"><Input type="number" step="any" value={r.quantity} onChange={(e) => setRow(idx, { quantity: e.target.value })} className="h-8 w-20 text-right" /></td>
                    <td className="p-2"><MoneyInput value={r.costPrice} onValueChange={(value) => setRow(idx, { costPrice: value })} className="h-8 w-28 text-right" /></td>
                    <td className="p-2"><MoneyInput value={r.salePrice} onValueChange={(value) => setRow(idx, { salePrice: value })} className="h-8 w-28 text-right" /></td>
                    <td className="p-2"><Input type="number" step="any" value={r.minStock} onChange={(e) => setRow(idx, { minStock: e.target.value })} className="h-8 w-20 text-right" /></td>
                    <td className="p-2">
                      <Input
                        value={r.ncm}
                        onChange={(e) => setRow(idx, { ncm: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                        inputMode="numeric"
                        maxLength={8}
                        placeholder="00000000"
                        className="h-8 w-24"
                      />
                      <span className="mt-1 block text-xs text-muted-foreground">CFOP {r.cfop ?? '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => doConfirm(false)} disabled={confirm.isPending}>
              {confirm.isPending ? <CarLoader className="size-4 animate-spin" /> : <Save className="size-4" />}
              Só cadastrar/atualizar
            </Button>
            <Button onClick={() => doConfirm(true)} disabled={confirm.isPending}>
              {confirm.isPending ? <CarLoader className="size-4 animate-spin" /> : <PackagePlus className="size-4" />}
              Cadastrar + dar entrada no estoque
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
