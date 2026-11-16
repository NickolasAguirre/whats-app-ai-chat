import { Module } from '@nestjs/common';
import { CasesService } from '../../../core/application/cases/cases.service.js';
import { CasesRepositoryModule } from '../persistence/cases-repository.module.js';

@Module({
    imports: [CasesRepositoryModule],
    providers: [CasesService],
    exports: [CasesService],
})
export class CasesModule {}
