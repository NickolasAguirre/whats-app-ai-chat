import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class StatsQueryDto {
    @ApiProperty({ enum: ['day', 'week', 'month'] })
    @IsIn(['day', 'week', 'month'], { message: '"period" debe ser day, week o month.' })
    period: 'day' | 'week' | 'month';

    @ApiPropertyOptional({ description: 'Desfase del navegador en minutos (`Date.getTimezoneOffset()`).', default: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: '"tzOffset" debe ser un número entero de minutos.' })
    @Min(-840)
    @Max(840)
    tzOffset?: number;
}
