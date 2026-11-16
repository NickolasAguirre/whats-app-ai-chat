import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class PeopleQueryDto {
    @ApiPropertyOptional({ description: 'Nombre o teléfono (parcial).', maxLength: 100 })
    @IsOptional()
    @IsString({ message: '"search" debe ser un texto.' })
    @MaxLength(100, { message: '"search" no puede superar los 100 caracteres.' })
    search?: string;

    @ApiPropertyOptional({ description: 'Solo personas con mensajes desde este instante (ISO 8601, incluido).' })
    @IsOptional()
    @IsISO8601({ strict: true }, { message: '"from" debe ser una fecha ISO 8601.' })
    from?: string;

    @ApiPropertyOptional({ description: 'Solo personas con mensajes antes de este instante (ISO 8601, excluido).' })
    @IsOptional()
    @IsISO8601({ strict: true }, { message: '"to" debe ser una fecha ISO 8601.' })
    to?: string;
}
