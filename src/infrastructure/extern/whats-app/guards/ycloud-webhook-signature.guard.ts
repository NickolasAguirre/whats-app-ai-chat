import { CanActivate, ExecutionContext, Injectable, Inject, RawBodyRequest, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { WhatsAppNumberRepositoryPort } from '../../../../core/domain/ports/whats-app-number-port/whats-app-number.port.js';
import { SecretsPort } from '../../../../core/domain/ports/secrets-port/secrets.port.js';
import { WhatsAppNumber } from '../../../../core/domain/entities/whats-app-number.entity.js';

const YCLOUD_SIGNATURE_HEADER = 'ycloud-signature';

interface RequestWithWhatsAppNumber extends RawBodyRequest<Request> {
    whatsAppNumber?: WhatsAppNumber;
}

@Injectable()
export class YCloudWebhookSignatureGuard implements CanActivate {
    constructor(
        @Inject(WhatsAppNumberRepositoryPort) private readonly whatsAppNumberRepository: WhatsAppNumberRepositoryPort,
        @Inject(SecretsPort) private readonly secrets: SecretsPort,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<RequestWithWhatsAppNumber>();
        const signatureHeader = request.headers[YCLOUD_SIGNATURE_HEADER];
        const rawBody = request.rawBody;

        if (typeof signatureHeader !== 'string' || !rawBody) {
            throw new UnauthorizedException('Missing webhook signature');
        }

        const wabaId = request.body?.whatsappInboundMessage?.wabaId;
        const whatsAppNumber = wabaId ? await this.whatsAppNumberRepository.findByExternalId(wabaId) : null;

        if (!whatsAppNumber) {
            throw new UnauthorizedException('Missing webhook signature');
        }

        const secret = await this.secrets.getSecret(whatsAppNumber.webhookSecretRef);

        if (!this.verifySignature(rawBody.toString('utf8'), signatureHeader, secret)) {
            throw new UnauthorizedException('Invalid webhook signature');
        }

        request.whatsAppNumber = whatsAppNumber;
        return true;
    }

    private verifySignature(payload: string, signatureHeader: string, secret: string): boolean {
        const parts = signatureHeader.split(',');
        const timestamp = parts[0]?.split('=')[1];
        const signature = parts[1]?.split('=')[1];

        if (!timestamp || !signature) {
            return false;
        }

        const signedPayload = `${timestamp}.${payload}`;
        const expectedSignature = createHmac('sha256', secret)
            .update(signedPayload)
            .digest('hex');

        const expectedBuffer = Buffer.from(expectedSignature, 'hex');
        const receivedBuffer = Buffer.from(signature, 'hex');

        if (expectedBuffer.length !== receivedBuffer.length) {
            return false;
        }

        return timingSafeEqual(expectedBuffer, receivedBuffer);
    }
}
