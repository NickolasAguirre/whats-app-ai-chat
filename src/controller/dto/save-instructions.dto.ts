import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_INSTRUCTIONS_LENGTH } from '../../core/domain/default-instructions.js';

export class SaveInstructionsDto {
    @ApiProperty({ maxLength: MAX_INSTRUCTIONS_LENGTH, description: 'Instrucciones de comportamiento del bot' })
    @IsString()
    @IsNotEmpty({ message: 'Las instrucciones no pueden estar vacías.' })
    @MaxLength(MAX_INSTRUCTIONS_LENGTH, { message: `Las instrucciones no pueden superar los ${MAX_INSTRUCTIONS_LENGTH} caracteres.` })
    content: string;
}
