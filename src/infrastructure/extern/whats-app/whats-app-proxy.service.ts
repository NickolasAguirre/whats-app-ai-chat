import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { WhatsAppMessage } from '../../../core/domain/entities/whats-app-message.entity.js';
import { WhatsAppPort } from '../../../core/domain/ports/whats-app-port/whats-app.port.js';

@Injectable()
export class WhatsAppService implements WhatsAppPort {
    constructor(private readonly http: HttpService, private readonly config: ConfigService) {}

    async sendMessage(message: WhatsAppMessage): Promise<void> {
        const url = this.config.get<string>("Y_CLOUD_URL") ?? "";
        const apiKeyCloud = this.config.get<string>("API_KEY_YCLOUD") ?? "";
        const headers = {
            'accept': 'application/json',
            'content-type': 'application/json',
            'X-API-Key': apiKeyCloud
        };

        const returnData = await firstValueFrom(this.http.post(url, message, { headers: headers }));
        console.log(returnData);
    }
}
