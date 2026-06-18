import { Injectable } from '@nestjs/common';
import { promises as dns } from 'node:dns';

/**
 * Resolve registros TXT de um host. Isolado em um serviço para permitir
 * mock nos testes (sem DNS real).
 */
@Injectable()
export class DnsVerifier {
  /** Retorna os valores TXT do host (cada registro já concatenado). */
  async txtRecords(host: string): Promise<string[]> {
    try {
      const records = await dns.resolveTxt(host);
      // Cada registro TXT pode vir em pedaços (chunks); junta cada um.
      return records.map((chunks) => chunks.join(''));
    } catch {
      // NXDOMAIN / sem TXT / falha de resolução → sem registros.
      return [];
    }
  }
}
