import {
    Body,
    Controller,
    Get,
    NotFoundException,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    UseGuards,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantMatchGuard } from './guards/tenant-match.guard.js';
import { CasesQueryDto, CreateCaseDto, UpdateCaseDto } from './dto/cases.dto.js';
import { CasesService } from '../core/application/cases/cases.service.js';
import { CaseRecord } from '../core/domain/entities/case.entity.js';

// El ValidationPipe va solo en los endpoints de administración: el DTO del webhook de YCloud no tiene decoradores.
@ApiTags('admin')
@UseGuards(TenantMatchGuard)
@Controller('admin/cases')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AdminCasesController {
    constructor(private readonly cases: CasesService) {}

    @Get()
    async list(@Query() query: CasesQueryDto) {
        return (await this.cases.list(query.status)).map(toCaseDto);
    }

    @Get(':id')
    async get(@Param('id', ParseUUIDPipe) id: string) {
        return toCaseDto(found(await this.cases.get(id), 'Caso no encontrado.'));
    }

    @Post()
    async create(@Body() dto: CreateCaseDto) {
        const created = await this.cases.registerManual(dto.personId, dto.summary.trim());
        return toCaseDto(found(created, 'Persona no encontrada.'));
    }

    @Patch(':id')
    async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCaseDto) {
        const updated = await this.cases.update(id, { status: dto.status, note: dto.note, assignee: dto.assignee });
        return toCaseDto(found(updated, 'Caso no encontrado.'));
    }
}

function found(record: CaseRecord | null, message: string): CaseRecord {
    if (!record) {
        throw new NotFoundException(message);
    }
    return record;
}

function toCaseDto(record: CaseRecord) {
    return {
        id: record.id,
        personId: record.personId,
        personName: record.personName ?? undefined,
        personPhone: record.personPhone,
        summary: record.summary,
        status: record.status,
        source: record.source,
        assignee: record.assignee ?? undefined,
        note: record.note ?? undefined,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        resolvedAt: record.resolvedAt?.toISOString() ?? null,
    };
}
