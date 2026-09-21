import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module.js';
import { InstructionsPrismaRepository } from './instructions-prisma.repository.js';
import { InstructionsRepositoryPort } from '../../../core/domain/ports/instructions-port/instructions.port.js';

@Module({
    imports: [PrismaModule],
    providers: [
        InstructionsPrismaRepository,
        { provide: InstructionsRepositoryPort, useExisting: InstructionsPrismaRepository },
    ],
    exports: [InstructionsRepositoryPort],
})
export class InstructionsRepositoryModule {}
