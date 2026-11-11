import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RagKnowledgeService } from './knowledge/rag-knowledge.service.js';
import { RagCollectionBootstrap } from './knowledge/rag-collection.bootstrap.js';
import { KnowledgePort } from '../../../core/domain/ports/knowledge-port/knowledge.port.js';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [RagKnowledgeService, RagCollectionBootstrap, { provide: KnowledgePort, useExisting: RagKnowledgeService }],
  exports: [KnowledgePort],
})
export class RagModule {}
