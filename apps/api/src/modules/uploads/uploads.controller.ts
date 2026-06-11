import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { StorageService } from '../../infra/storage/storage.service';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ): Promise<{ url: string }> {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    if (!ALLOWED.includes(file.mimetype)) {
      throw new BadRequestException('Formato inválido. Envie uma imagem.');
    }
    const filename = await this.storage.save(file.buffer, file.originalname);
    const base = `${req.protocol}://${req.get('host')}`;
    return { url: `${base}${this.storage.publicPath(filename)}` };
  }
}
