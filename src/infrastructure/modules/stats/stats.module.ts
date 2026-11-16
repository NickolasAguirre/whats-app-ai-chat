import { Module } from '@nestjs/common';
import { StatsService } from '../../../core/application/stats/stats.service.js';
import { NumbersModule } from '../whats-app/numbers.module.js';
import { StatsQueryRepositoryModule } from '../persistence/stats-query-repository.module.js';

@Module({
    imports: [StatsQueryRepositoryModule, NumbersModule],
    providers: [StatsService],
    exports: [StatsService],
})
export class StatsModule {}
