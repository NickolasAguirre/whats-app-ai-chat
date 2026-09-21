import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { WhatsAppNumberRepositoryPort } from '../../../core/domain/ports/whats-app-number-port/whats-app-number.port.js';
import { WhatsAppNumber } from '../../../core/domain/entities/whats-app-number.entity.js';

@Injectable()
export class WhatsAppNumberPrismaRepository implements WhatsAppNumberRepositoryPort {
    constructor(private readonly prisma: PrismaService) {}

    async findByExternalId(wabaIdOrPhone: string): Promise<WhatsAppNumber | null> {
        return this.prisma.whatsAppNumber.findFirst({
            where: { OR: [{ wabaId: wabaIdOrPhone }, { phoneNumber: wabaIdOrPhone }] },
        });
    }
}
