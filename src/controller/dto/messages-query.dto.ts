import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

export class MessagesQueryDto {
    @ApiPropertyOptional({ description: 'Incluye mensajes desde este instante (ISO 8601).' })
    @IsOptional()
    @IsISO8601({ strict: true }, { message: '"from" debe ser una fecha ISO 8601.' })
    from?: string;

    @ApiPropertyOptional({ description: 'Excluye mensajes desde este instante (ISO 8601).' })
    @IsOptional()
    @IsISO8601({ strict: true }, { message: '"to" debe ser una fecha ISO 8601.' })
    to?: string;

    @ApiPropertyOptional({ description: 'Cursor devuelto como `nextCursor` por la página anterior.' })
    @IsOptional()
    @IsString()
    before?: string;

    @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;
}
