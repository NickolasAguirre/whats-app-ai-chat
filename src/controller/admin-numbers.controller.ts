import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantMatchGuard } from './guards/tenant-match.guard.js';
import { NumbersPort } from '../core/domain/ports/numbers-port/numbers.port.js';

@ApiTags('admin')
@UseGuards(TenantMatchGuard)
@Controller('admin/numbers')
export class AdminNumbersController {
    constructor(@Inject(NumbersPort) private readonly numbers: NumbersPort) {}

    @Get()
    list() {
        return this.numbers.list();
    }

    @Get(':id')
    get(@Param('id') id: string) {
        const found = this.numbers.get(id);
        if (!found) {
            throw new NotFoundException('Número no encontrado.');
        }
        return found;
    }
}
