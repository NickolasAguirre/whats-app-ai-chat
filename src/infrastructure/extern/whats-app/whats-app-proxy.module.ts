import { Module } from '@nestjs/common';
import { WhatsAppService } from './whats-app-proxy.service.js';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppPort } from '../../../core/domain/ports/whats-app-port/whats-app.port.js';
import { YCloudWebhookSignatureGuard } from './guards/ycloud-webhook-signature.guard.js';

@Module({
    imports: [HttpModule, ConfigModule],
    providers: [
        WhatsAppService,
        { provide: WhatsAppPort, useExisting: WhatsAppService },
        YCloudWebhookSignatureGuard,
    ],
    exports: [WhatsAppPort, YCloudWebhookSignatureGuard],
})
export class WhatsAppModule {}
