import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { Permission } from '@oficina/shared';
import { StorageService } from '../../infra/storage/storage.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { QuotasService } from '../saas/quotas.service';
import { UploadAssetsService } from './upload-assets.service';

type DetectedImage = { mime: string; extension: '.png' | '.jpg' | '.webp' | '.gif' };

function detectImage(buffer: Buffer): DetectedImage | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', extension: '.png' };
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', extension: '.jpg' };
  }

  if (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
      buffer.subarray(0, 6).toString('ascii') === 'GIF89a')
  ) {
    return { mime: 'image/gif', extension: '.gif' };
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', extension: '.webp' };
  }

  return null;
}

@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly quotas: QuotasService,
    private readonly assets: UploadAssetsService,
  ) {}

  @Post()
  @RequirePermission(Permission.UPLOADS_WRITE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async upload(
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ id: string; url: string }> {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');

    const detected = detectImage(file.buffer);
    if (!detected) {
      throw new BadRequestException('Formato inválido. Envie PNG, JPG, WEBP ou GIF.');
    }

    await this.quotas.consumeForTenant(actor.tenantId, 'UPLOADS_MONTH', 1);

    const filename = await this.storage.save(file.buffer, detected.extension);
    const path = this.storage.publicPath(filename);
    // Base confiável via APP_URL (configurada); sem ela, retorna URL relativa.
    // Nunca usa o Host do request (evita host-header injection na URL salva).
    const base = (this.config.get<string>('APP_URL') || process.env.APP_URL || '').replace(
      /\/+$/,
      '',
    );
    const url = `${base}${path}`;
    const asset = await this.assets.register({
      actor,
      filename,
      path,
      url,
      mime: detected.mime,
      extension: detected.extension,
      sizeBytes: file.size,
    });
    return { id: asset.id, url: asset.url };
  }
}
