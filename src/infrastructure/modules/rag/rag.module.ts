import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RagKnowledgeService } from '../../extern/rag/knowledge/rag-knowledge.service.js';
import { ContainerModule } from '../container/container.module.js';
import { KnowledgePort } from '../../../core/domain/ports/knowledge-port/knowledge.port.js';

@Module({
  imports: [HttpModule, ConfigModule, ContainerModule],
  providers: [RagKnowledgeService, { provide: KnowledgePort, useExisting: RagKnowledgeService }],
  exports: [KnowledgePort],
})
export class RagModule {}
