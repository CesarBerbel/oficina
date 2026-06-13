import AdmZip from 'adm-zip';
import { parseNfeBuffer } from './nfe-parser';

const validNfeXml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc>
  <NFe>
    <infNFe>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>Fornecedor Teste</xNome>
      </emit>
      <det>
        <prod>
          <cProd>FILTRO-001</cProd>
          <cEAN>7891234567890</cEAN>
          <xProd>Filtro de óleo</xProd>
          <uCom>UN</uCom>
          <qCom>2.000</qCom>
          <vUnCom>30.50</vUnCom>
          <vProd>61.00</vProd>
          <NCM>84212300</NCM>
          <CFOP>5102</CFOP>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>`;

describe('parseNfeBuffer', () => {
  it('lê um XML de NF-e válido', () => {
    const result = parseNfeBuffer(Buffer.from(validNfeXml), 'nfe.xml');

    expect(result.supplierCnpj).toBe('12345678000199');
    expect(result.supplierName).toBe('Fornecedor Teste');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      cProd: 'FILTRO-001',
      ean: '7891234567890',
      name: 'Filtro de óleo',
      quantity: 2,
      unitCost: 30.5,
      total: 61,
    });
  });

  it('bloqueia ZIP com XMLs acima do limite operacional', () => {
    const zip = new AdmZip();
    for (let i = 0; i < 26; i++) {
      zip.addFile(`nfe-${i}.xml`, Buffer.from(validNfeXml));
    }

    expect(() => parseNfeBuffer(zip.toBuffer(), 'nfes.zip')).toThrow(
      'ZIP excede o limite de 25 arquivos XML',
    );
  });

  it('bloqueia arquivo que não parece XML nem ZIP', () => {
    expect(() => parseNfeBuffer(Buffer.from('conteudo invalido'), 'nfe.xml')).toThrow(
      'Arquivo não parece ser XML',
    );
  });
});
