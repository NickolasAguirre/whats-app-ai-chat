import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CollentionService } from './collention/collention.service.js';
import { ItemService } from './item/item.service.js';

@Module({
  providers: [CollentionService, ItemService],
  imports: [HttpModule, ConfigModule],
})
export class RagModule {}
