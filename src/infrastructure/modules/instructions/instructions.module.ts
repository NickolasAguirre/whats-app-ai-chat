import { Module } from '@nestjs/common';
import { InstructionsService } from '../../../core/application/instructions/instructions.service.js';
import { InstructionsRepositoryModule } from '../persistence/instructions-repository.module.js';

@Module({
    imports: [InstructionsRepositoryModule],
    providers: [InstructionsService],
    exports: [InstructionsService],
})
export class InstructionsModule {}
