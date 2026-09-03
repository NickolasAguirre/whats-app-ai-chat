import { CanActivate, ExecutionContext, Injectable, RawBodyRequest, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';

const YCLOUD_SIGNATURE_HEADER = 'ycloud-signature';

@Injectable()
export class YCloudWebhookSignatureGuard implements CanActivate {
    constructor(private readonly config: ConfigService) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
        console.log(request.headers);
        const signatureHeader = request.headers[YCLOUD_SIGNATURE_HEADER];
        const rawBody = request.rawBody;

        if (typeof signatureHeader !== 'string' || !rawBody) {
            throw new UnauthorizedException('Missing webhook signature');
        }

        const secret = this.config.get<string>('YCLOUD_WEBHOOK_SECRET') ?? '';
        if (!this.verifySignature(rawBody.toString('utf8'), signatureHeader, secret)) {
            throw new UnauthorizedException('Invalid webhook signature');
        }

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
