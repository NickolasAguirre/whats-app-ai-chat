import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { YCloudWebhookSignatureGuard } from './ycloud-webhook-signature.guard.js';

function buildSignature(payload: string, secret: string): string {
  const timestamp = '1700000000';
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function buildContext(headers: Record<string, string>, rawBody?: Buffer): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, rawBody }),
    }),
  } as unknown as ExecutionContext;
}

describe('YCloudWebhookSignatureGuard', () => {
  const configMock = { getOrThrow: vi.fn() };
  let guard: YCloudWebhookSignatureGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    configMock.getOrThrow.mockReturnValue('secreto-correcto');
    guard = new YCloudWebhookSignatureGuard(configMock as never);
  });

  it('rechaza si falta la firma o el cuerpo crudo', () => {
    expect(() => guard.canActivate(buildContext({}, Buffer.from('{}')))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(buildContext({ 'ycloud-signature': 't=1,v1=x' }))).toThrow(UnauthorizedException);
  });

  it('rechaza si la firma no coincide con YCLOUD_WEBHOOK_SECRET', () => {
    const body = JSON.stringify({ whatsappInboundMessage: {} });
    const context = buildContext({ 'ycloud-signature': 't=1700000000,v1=firmaInvalida' }, Buffer.from(body));

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(configMock.getOrThrow).toHaveBeenCalledWith('YCLOUD_WEBHOOK_SECRET');
  });

  it('acepta la request cuando la firma es válida', () => {
    const body = JSON.stringify({ whatsappInboundMessage: {} });
    const context = buildContext({ 'ycloud-signature': buildSignature(body, 'secreto-correcto') }, Buffer.from(body));

    expect(guard.canActivate(context)).toBe(true);
  });
});
