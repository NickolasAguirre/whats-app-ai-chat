import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { WhatsAppMessage } from '../../../core/domain/entities/whats-app-message.entity.js';
import { WhatsAppPort } from '../../../core/domain/ports/whats-app-port/whats-app.port.js';

const Y_CLOUD_SEND_URL = 'https://api.ycloud.com/v2/whatsapp/messages';

@Injectable()
export class WhatsAppService implements WhatsAppPort {
    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService,
    ) {}

    async sendMessage(message: WhatsAppMessage): Promise<void> {
        const headers = {
            'accept': 'application/json',
            'content-type': 'application/json',
            'X-API-Key': this.config.getOrThrow<string>('API_KEY_YCLOUD'),
        };

        await firstValueFrom(this.http.post(Y_CLOUD_SEND_URL, message, { headers }));
    }
}
