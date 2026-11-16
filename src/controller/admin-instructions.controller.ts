import { Body, Controller, Delete, Get, HttpCode, Put, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantMatchGuard } from './guards/tenant-match.guard.js';
import { SaveInstructionsDto } from './dto/save-instructions.dto.js';
import { InstructionsService } from '../core/application/instructions/instructions.service.js';

// El ValidationPipe va solo en los endpoints de administración: el DTO del webhook de YCloud no tiene decoradores.
@ApiTags('admin')
@UseGuards(TenantMatchGuard)
@Controller('admin/instructions')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AdminInstructionsController {
    constructor(private readonly instructionsService: InstructionsService) {}

    @Get()
    get() {
        return this.instructionsService.getEffective();
    }

    @Put()
    save(@Body() dto: SaveInstructionsDto) {
        return this.instructionsService.save(dto.content);
    }

    @Delete()
    @HttpCode(204)
    async reset(): Promise<void> {
        await this.instructionsService.reset();
    }
}
