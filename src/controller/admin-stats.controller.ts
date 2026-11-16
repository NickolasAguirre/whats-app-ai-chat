import { Controller, Get, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantMatchGuard } from './guards/tenant-match.guard.js';
import { StatsQueryDto } from './dto/stats-query.dto.js';
import { StatsService } from '../core/application/stats/stats.service.js';

// El ValidationPipe va solo en los endpoints de administración: el DTO del webhook de YCloud no tiene decoradores.
@ApiTags('admin')
@UseGuards(TenantMatchGuard)
@Controller('admin/stats')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AdminStatsController {
    constructor(private readonly stats: StatsService) {}

    @Get()
    get(@Query() query: StatsQueryDto) {
        return this.stats.getDashboard(query.period, query.tzOffset ?? 0);
    }
}
