import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { TenantMatchGuard } from './tenant-match.guard.js';

describe('TenantMatchGuard', () => {
  const identityMock = { getTenantCode: vi.fn() };
  const guard = new TenantMatchGuard(identityMock as never);
  const contextWith = (user: unknown) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as never;

  beforeEach(() => {
    vi.resetAllMocks();
    identityMock.getTenantCode.mockResolvedValue('acme');
  });

  it('deja pasar un token del mismo tenant', async () => {
    await expect(guard.canActivate(contextWith({ sub: 'u1', tenantCode: 'acme' }))).resolves.toBe(true);
  });

  it('responde 403 si el token es de otro tenant', async () => {
    await expect(guard.canActivate(contextWith({ sub: 'u1', tenantCode: 'otro' }))).rejects.toThrow(ForbiddenException);
  });

  it.each([undefined, null, {}, { tenantCode: '' }])('responde 403 si no hay principal con tenantCode (%j)', async (user) => {
    await expect(guard.canActivate(contextWith(user))).rejects.toThrow(ForbiddenException);
    expect(identityMock.getTenantCode).not.toHaveBeenCalled();
  });

  it('si container no responde, propaga el 503 del adaptador', async () => {
    identityMock.getTenantCode.mockRejectedValue(new ServiceUnavailableException('sin tenant'));

    await expect(guard.canActivate(contextWith({ sub: 'u1', tenantCode: 'acme' }))).rejects.toThrow(ServiceUnavailableException);
  });
});
