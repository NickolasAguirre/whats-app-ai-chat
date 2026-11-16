import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatsQueryRepository } from '../../persistence/repositories/stats-query.repository.js';
import { StatsQueryPort } from '../../../core/domain/ports/stats-query-port/stats-query.port.js';
import { MessageSchema } from '../../persistence/schemas/message.schema.js';
import { PersonSchema } from '../../persistence/schemas/person.schema.js';

@Module({
    imports: [TypeOrmModule.forFeature([MessageSchema, PersonSchema])],
    providers: [StatsQueryRepository, { provide: StatsQueryPort, useExisting: StatsQueryRepository }],
    exports: [StatsQueryPort],
})
export class StatsQueryRepositoryModule {}
