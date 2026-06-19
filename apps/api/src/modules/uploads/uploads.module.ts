import { Global, Module } from '@nestjs/common';
import { StorageService } from '../../infra/storage/storage.service';
import { UploadsController } from './uploads.controller';
import { UploadAssetsService } from './upload-assets.service';

@Global()
@Module({
  controllers: [UploadsController],
  providers: [StorageService, UploadAssetsService],
  exports: [StorageService, UploadAssetsService],
})
export class UploadsModule {}
