import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const UPLOAD_PATH_RE = /^\/uploads\/([a-f0-9]{32}\.(?:png|jpg|jpeg|webp|gif))$/i;

export interface RegisterUploadAssetInput {
  actor: AuthenticatedUser;
  filename: string;
  path: string;
  url: string;
  mime: string;
  extension: string;
  sizeBytes: number;
}

@Injectable()
export class UploadAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterUploadAssetInput): Promise<{ id: string; url: string }> {
    const asset = await this.prisma.uploadAsset.create({
      data: {
        tenantId: input.actor.tenantId,
        createdById: input.actor.id,
        filename: input.filename,
        path: input.path,
        url: input.url,
        mime: input.mime,
        extension: input.extension,
        sizeBytes: input.sizeBytes,
      },
      select: { id: true, url: true },
    });
    return asset;
  }

  async assertOwnedInternalPhotoUrls(tenantId: string, urls: readonly string[]): Promise<void> {
    if (urls.length === 0) return;

    const filenames = urls.map((url) => this.extractOwnedUploadFilename(url));
    const uniqueFilenames = [...new Set(filenames)];
    const owned = await this.prisma.uploadAsset.findMany({
      where: { tenantId, filename: { in: uniqueFilenames } },
      select: { filename: true },
    });
    const ownedSet = new Set(owned.map((row) => row.filename));
    const missing = uniqueFilenames.find((filename) => !ownedSet.has(filename));
    if (missing) {
      throw new BadRequestException('Foto inválida: o upload não pertence a esta oficina.');
    }
  }

  private extractOwnedUploadFilename(value: string): string {
    const pathname = this.pathnameForInternalUpload(value);
    const match = UPLOAD_PATH_RE.exec(pathname);
    if (!match) {
      throw new BadRequestException('Foto inválida: use apenas uploads internos do sistema.');
    }
    return match[1].toLowerCase();
  }

  private pathnameForInternalUpload(value: string): string {
    if (value.startsWith('/')) return value;

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new BadRequestException('Foto inválida: use apenas uploads internos do sistema.');
    }

    const appUrl = (this.config.get<string>('APP_URL') || process.env.APP_URL || '').trim();
    if (!appUrl) {
      throw new BadRequestException('Foto inválida: use a URL retornada pelo upload interno.');
    }

    const expectedOrigin = new URL(appUrl).origin;
    if (parsed.origin !== expectedOrigin) {
      throw new BadRequestException('Foto inválida: URLs externas não são permitidas.');
    }

    return parsed.pathname;
  }
}
