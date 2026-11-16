import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { CASE_STATUSES } from '../../core/domain/entities/case.entity.js';
import type { CaseStatus } from '../../core/domain/entities/case.entity.js';

export class CasesQueryDto {
    @ApiPropertyOptional({ enum: CASE_STATUSES })
    @IsOptional()
    @IsIn(CASE_STATUSES, { message: '"status" debe ser open, in_progress o resolved.' })
    status?: CaseStatus;
}

export class CreateCaseDto {
    @ApiProperty()
    @IsUUID(undefined, { message: 'La persona no es válida.' })
    personId: string;

    @ApiProperty({ maxLength: 500 })
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @IsNotEmpty({ message: 'El resumen no puede estar vacío.' })
    @MaxLength(500, { message: 'El resumen no puede superar los 500 caracteres.' })
    summary: string;
}

export class UpdateCaseDto {
    @ApiPropertyOptional({ enum: CASE_STATUSES })
    @ValidateIf((_object, value) => value !== undefined)
    @IsIn(CASE_STATUSES, { message: '"status" debe ser open, in_progress o resolved.' })
    status?: CaseStatus;

    @ApiPropertyOptional({ maxLength: 2000, description: 'Cadena vacía borra la nota.' })
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    @MaxLength(2000, { message: 'La nota no puede superar los 2000 caracteres.' })
    note?: string;

    @ApiPropertyOptional({ maxLength: 100, description: 'Cadena vacía borra el valor.' })
    @ValidateIf((_object, value) => value !== undefined)
    @IsString()
    @MaxLength(100, { message: '"Atendido por" no puede superar los 100 caracteres.' })
    assignee?: string;
}
