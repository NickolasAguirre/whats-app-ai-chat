import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class NoteDto {
    @ApiProperty({ maxLength: 200 })
    @IsString()
    @IsNotEmpty({ message: 'El título no puede estar vacío.' })
    @MaxLength(200, { message: 'El título no puede superar los 200 caracteres.' })
    title: string;

    @ApiProperty({ maxLength: 50000 })
    @IsString()
    @IsNotEmpty({ message: 'El contenido no puede estar vacío.' })
    @MaxLength(50000, { message: 'El contenido no puede superar los 50000 caracteres.' })
    content: string;
}
