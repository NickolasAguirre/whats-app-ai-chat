import { Module } from '@nestjs/common';
import { AdminInstructionsController } from '../../../controller/admin-instructions.controller.js';
import { AdminKnowledgeController } from '../../../controller/admin-knowledge.controller.js';
import { InstructionsModule } from '../instructions/instructions.module.js';
import { RagModule } from '../rag/rag.module.js';
import { ContainerModule } from '../container/container.module.js';

@Module({
    imports: [InstructionsModule, RagModule, ContainerModule],
    controllers: [AdminInstructionsController, AdminKnowledgeController],
})
export class AdminModule {}
