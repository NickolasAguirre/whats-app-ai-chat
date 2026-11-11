import { Module } from '@nestjs/common';
import { InstructionsService } from '../core/use-case/instructions/instructions.service.js';
import { InstructionsRepositoryModule } from '../infrastructure/persistence/instructions-repository.module.js';

@Module({
    imports: [InstructionsRepositoryModule],
    providers: [InstructionsService],
    exports: [InstructionsService],
})
export class InstructionsModule {}
