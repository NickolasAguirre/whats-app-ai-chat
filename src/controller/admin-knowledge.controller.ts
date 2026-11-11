import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Inject,
    Param,
    Post,
    Put,
    UploadedFile,
    UseInterceptors,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { NoteDto } from './dto/note.dto.js';
import { KnowledgePort } from '../core/domain/ports/knowledge-port/knowledge.port.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Forma mínima del archivo que entrega multer (tsconfig no carga los tipos globales de Express.Multer).
interface UploadedBinary {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
}

// El ValidationPipe va solo en los endpoints de administración: el DTO del webhook de YCloud no tiene decoradores.
@ApiTags('admin')
@Controller('admin/knowledge')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AdminKnowledgeController {
    constructor(@Inject(KnowledgePort) private readonly knowledge: KnowledgePort) {}

    @Get()
    list() {
        return this.knowledge.list();
    }

    // Se deja pasar un byte más del máximo para que Rag-API responda con su propio mensaje en español.
    @Post('files')
    @HttpCode(202)
    @ApiConsumes('multipart/form-data')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES + 1 } }))
    uploadFile(@UploadedFile() file?: UploadedBinary) {
        if (!file) {
            throw new BadRequestException('Falta el archivo (campo "file").');
        }

        // multer decodifica el nombre como latin1; se recupera el UTF-8 original (tildes, ñ).
        const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
        return this.knowledge.uploadFile({ name, mimeType: file.mimetype, bytes: file.buffer });
    }

    @Post('notes')
    createNote(@Body() dto: NoteDto) {
        return this.knowledge.createNote(dto);
    }

    @Put('notes/:id')
    updateNote(@Param('id') id: string, @Body() dto: NoteDto) {
        return this.knowledge.updateNote(id, dto);
    }

    @Delete(':id')
    @HttpCode(204)
    async remove(@Param('id') id: string): Promise<void> {
        await this.knowledge.remove(id);
    }
}
