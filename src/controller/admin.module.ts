import { Module } from '@nestjs/common';
import { AdminInstructionsController } from './admin-instructions.controller.js';
import { AdminKnowledgeController } from './admin-knowledge.controller.js';
import { InstructionsModule } from './instructions.module.js';
import { RagModule } from '../infrastructure/extern/rag/rag.module.js';

@Module({
    imports: [InstructionsModule, RagModule],
    controllers: [AdminInstructionsController, AdminKnowledgeController],
})
export class AdminModule {}
