import { Module } from '@nestjs/common';
import { PublicService } from './public.service';
import { PublicController } from './public.controller';
import { PublicSiteController } from './public-site.controller';
import { QuotesModule } from '../quotes/quotes.module';
import { SiteModule } from '../site/site.module';
import { BlogModule } from '../blog/blog.module';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [QuotesModule, SiteModule, BlogModule, LeadsModule],
  controllers: [PublicController, PublicSiteController],
  providers: [PublicService],
})
export class PublicModule {}
