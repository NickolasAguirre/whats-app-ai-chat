import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module.js';
import { WhatsAppNumberPrismaRepository } from './whats-app-number-prisma.repository.js';
import { WhatsAppNumberRepositoryPort } from '../../../core/domain/ports/whats-app-number-port/whats-app-number.port.js';

@Module({
    imports: [PrismaModule],
    providers: [
        WhatsAppNumberPrismaRepository,
        { provide: WhatsAppNumberRepositoryPort, useExisting: WhatsAppNumberPrismaRepository },
    ],
    exports: [WhatsAppNumberRepositoryPort],
})
export class WhatsAppNumberRepositoryModule {}
