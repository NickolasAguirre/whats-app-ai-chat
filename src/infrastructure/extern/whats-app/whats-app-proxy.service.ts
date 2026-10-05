import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { WhatsAppMessage } from '../../../core/domain/entities/whats-app-message.entity.js';
import { WhatsAppPort } from '../../../core/domain/ports/whats-app-port/whats-app.port.js';
import { WhatsAppNumberRepositoryPort } from '../../../core/domain/ports/whats-app-number-port/whats-app-number.port.js';
import { SecretsPort } from '../../../core/domain/ports/secrets-port/secrets.port.js';

const Y_CLOUD_SEND_URL = 'https://api.ycloud.com/v2/whatsapp/messages';

@Injectable()
export class WhatsAppService implements WhatsAppPort {
    constructor(
        private readonly http: HttpService,
        @Inject(WhatsAppNumberRepositoryPort) private readonly whatsAppNumberRepository: WhatsAppNumberRepositoryPort,
        @Inject(SecretsPort) private readonly secrets: SecretsPort,
    ) {}

    async sendMessage(message: WhatsAppMessage): Promise<void> {
        const whatsAppNumber = await this.whatsAppNumberRepository.findByExternalId(message.from);

        if (!whatsAppNumber) {
            throw new Error(`No WhatsAppNumber registered for sender ${message.from}`);
        }

        const apiKey = await this.secrets.getSecret(whatsAppNumber.ycloudApiKeySecretRef);
        const headers = {
            'accept': 'application/json',
            'content-type': 'application/json',
            'X-API-Key': apiKey,
        };

        await firstValueFrom(this.http.post(Y_CLOUD_SEND_URL, message, { headers }));
    }
}
