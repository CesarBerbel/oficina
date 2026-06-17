import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  nfeConfirmSchema,
  Permission,
  type NfeConfirmInput,
} from '@oficina/shared';
import { NfeImportService } from './nfe-import.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('nfe-import')
export class NfeImportController {
  constructor(private readonly nfe: NfeImportService) {}

  @Post('parse')
  @RequirePermission(Permission.NFE_IMPORT)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }),
  )
  parse(
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Envie um arquivo .xml ou .zip');
    return this.nfe.parse(actor.groupId, file.buffer, file.originalname);
  }

  @Post('confirm')
  @RequirePermission(Permission.NFE_IMPORT)
  confirm(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(nfeConfirmSchema)) body: NfeConfirmInput,
  ) {
    return this.nfe.confirm(actor, body);
  }
}
