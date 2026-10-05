import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { YCloudWebhookSignatureGuard } from './ycloud-webhook-signature.guard.js';
import { WhatsAppNumberRepositoryPort } from '../../../../core/domain/ports/whats-app-number-port/whats-app-number.port.js';
import { SecretsPort } from '../../../../core/domain/ports/secrets-port/secrets.port.js';

function buildSignature(payload: string, secret: string): string {
  const timestamp = '1700000000';
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function buildContext(headers: Record<string, string>, rawBody: Buffer): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, rawBody, body: JSON.parse(rawBody.toString('utf8')) }),
    }),
  } as unknown as ExecutionContext;
}

describe('YCloudWebhookSignatureGuard', () => {
  let guard: YCloudWebhookSignatureGuard;
  const whatsAppNumberRepoMock = { findByExternalId: vi.fn() };
  const secretsMock = { getSecret: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YCloudWebhookSignatureGuard,
        { provide: WhatsAppNumberRepositoryPort, useValue: whatsAppNumberRepoMock },
        { provide: SecretsPort, useValue: secretsMock },
      ],
    }).compile();

    guard = module.get<YCloudWebhookSignatureGuard>(YCloudWebhookSignatureGuard);
  });

  it('rechaza si el número de WhatsApp no está registrado', async () => {
    whatsAppNumberRepoMock.findByExternalId.mockResolvedValueOnce(null);
    const body = JSON.stringify({ whatsappInboundMessage: { wabaId: 'unknown' } });
    const context = buildContext({ 'ycloud-signature': 't=1,v1=x' }, Buffer.from(body));

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza si la firma no coincide con el secreto del tenant', async () => {
    const whatsAppNumber = { id: 'w1', tenantId: 't1', webhookSecretRef: 'REF' };
    whatsAppNumberRepoMock.findByExternalId.mockResolvedValueOnce(whatsAppNumber);
    secretsMock.getSecret.mockResolvedValueOnce('secreto-correcto');
    const body = JSON.stringify({ whatsappInboundMessage: { wabaId: 'waba1' } });
    const context = buildContext({ 'ycloud-signature': 't=1700000000,v1=firmaInvalida' }, Buffer.from(body));

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('acepta la request y adjunta el WhatsAppNumber resuelto cuando la firma es válida', async () => {
    const whatsAppNumber = { id: 'w1', tenantId: 't1', webhookSecretRef: 'REF' };
    whatsAppNumberRepoMock.findByExternalId.mockResolvedValueOnce(whatsAppNumber);
    secretsMock.getSecret.mockResolvedValueOnce('secreto-correcto');
    const body = JSON.stringify({ whatsappInboundMessage: { wabaId: 'waba1' } });
    const signature = buildSignature(body, 'secreto-correcto');
    const request = { headers: { 'ycloud-signature': signature }, rawBody: Buffer.from(body), body: JSON.parse(body) };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect((request as any).whatsAppNumber).toEqual(whatsAppNumber);
  });
});
