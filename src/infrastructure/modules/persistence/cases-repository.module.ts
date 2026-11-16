import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CasesRepository } from '../../persistence/repositories/cases.repository.js';
import { CasesPort } from '../../../core/domain/ports/cases-port/cases.port.js';
import { CaseSchema } from '../../persistence/schemas/case.schema.js';

@Module({
    imports: [TypeOrmModule.forFeature([CaseSchema])],
    providers: [CasesRepository, { provide: CasesPort, useExisting: CasesRepository }],
    exports: [CasesPort],
})
export class CasesRepositoryModule {}
