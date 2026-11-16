import { Test, TestingModule } from '@nestjs/testing';
import { generateKeyPairSync } from 'node:crypto';
import { JwtAuth } from './jwt-auth.js';

describe('JwtAuth', () => {
  let provider: JwtAuth;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtAuth],
    }).compile();

    provider = module.get<JwtAuth>(JwtAuth);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});

describe('JwtAuth.validate', () => {
  const publicKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const validator = new JwtAuth({ registerProvider: vi.fn() } as never, { get: () => publicKey } as never);

  it('devuelve { sub, tenantCode } de un token válido', () => {
    expect(validator.validate({ sub: 'u1', tenantCode: 'acme-7k3m9x2q' })).toEqual({ sub: 'u1', tenantCode: 'acme-7k3m9x2q' });
  });

  it.each([
    ['sin tenantCode', { sub: 'u1' }],
    ['con mayúsculas', { sub: 'u1', tenantCode: 'Acme' }],
    ['con espacios', { sub: 'u1', tenantCode: 'con espacio' }],
    ['de 64 caracteres', { sub: 'u1', tenantCode: 'a'.repeat(64) }],
    ['sin sub', { tenantCode: 'acme' }],
  ])('rechaza (null) un token %s', (_name, claims) => {
    expect(validator.validate(claims)).toBeNull();
  });
});
