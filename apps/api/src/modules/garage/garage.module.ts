import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GarageService } from './garage.service';
import { GarageController } from './garage.controller';

@Module({
  imports: [JwtModule.register({})],
  controllers: [GarageController],
  providers: [GarageService],
})
export class GarageModule {}
