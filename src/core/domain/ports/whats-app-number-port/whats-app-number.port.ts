import { WhatsAppNumber } from '../../entities/whats-app-number.entity.js';

export abstract class WhatsAppNumberRepositoryPort {
    abstract findByExternalId(wabaIdOrPhone: string): Promise<WhatsAppNumber | null>;
}
