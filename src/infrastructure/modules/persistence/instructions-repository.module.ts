import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstructionsRepository } from '../../persistence/repositories/instructions.repository.js';
import { InstructionsRepositoryPort } from '../../../core/domain/ports/instructions-port/instructions.port.js';
import { InstructionsSchema } from '../../persistence/schemas/instructions.schema.js';

@Module({
    imports: [TypeOrmModule.forFeature([InstructionsSchema])],
    providers: [
        InstructionsRepository,
        { provide: InstructionsRepositoryPort, useExisting: InstructionsRepository },
    ],
    exports: [InstructionsRepositoryPort],
})
export class InstructionsRepositoryModule {}
