import { Module } from '@nestjs/common';
import { AdminCasesController } from '../../../controller/admin-cases.controller.js';
import { AdminInstructionsController } from '../../../controller/admin-instructions.controller.js';
import { AdminKnowledgeController } from '../../../controller/admin-knowledge.controller.js';
import { AdminNumbersController } from '../../../controller/admin-numbers.controller.js';
import { AdminPeopleController } from '../../../controller/admin-people.controller.js';
import { AdminStatsController } from '../../../controller/admin-stats.controller.js';
import { InstructionsModule } from '../instructions/instructions.module.js';
import { RagModule } from '../rag/rag.module.js';
import { ContainerModule } from '../container/container.module.js';
import { ConversationsQueryRepositoryModule } from '../persistence/conversations-query-repository.module.js';
import { CasesModule } from '../cases/cases.module.js';
import { StatsModule } from '../stats/stats.module.js';
import { NumbersModule } from '../whats-app/numbers.module.js';

@Module({
    imports: [
        InstructionsModule,
        RagModule,
        ContainerModule,
        ConversationsQueryRepositoryModule,
        StatsModule,
        NumbersModule,
        CasesModule,
    ],
    controllers: [
        AdminCasesController,
        AdminInstructionsController,
        AdminKnowledgeController,
        AdminNumbersController,
        AdminPeopleController,
        AdminStatsController,
    ],
})
export class AdminModule {}
