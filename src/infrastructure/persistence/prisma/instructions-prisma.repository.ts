import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { InstructionsRepositoryPort } from '../../../core/domain/ports/instructions-port/instructions.port.js';
import { Instructions } from '../../../core/domain/entities/instructions.entity.js';

@Injectable()
export class InstructionsPrismaRepository implements InstructionsRepositoryPort {
    constructor(private readonly prisma: PrismaService) {}

    async getForTenant(tenantId: string): Promise<Instructions | null> {
        return this.prisma.instructions.findUnique({ where: { tenantId } });
    }
}
