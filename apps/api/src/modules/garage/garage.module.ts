import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GarageService } from './garage.service';
import { GarageController } from './garage.controller';
import { SiteModule } from '../site/site.module';

@Module({
  imports: [JwtModule.register({}), SiteModule],
  controllers: [GarageController],
  providers: [GarageService],
})
export class GarageModule {}
