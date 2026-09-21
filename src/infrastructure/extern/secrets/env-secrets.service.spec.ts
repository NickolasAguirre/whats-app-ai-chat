import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EnvSecretsService } from './env-secrets.service.js';

describe('EnvSecretsService', () => {
  let service: EnvSecretsService;
  const configMock = { get: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnvSecretsService,
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<EnvSecretsService>(EnvSecretsService);
  });

  it('getSecret resuelve el valor leyendo la referencia como variable de entorno', async () => {
    configMock.get.mockReturnValueOnce('el-valor-secreto');

    const result = await service.getSecret('TENANT_T1_WEBHOOK_SECRET');

    expect(result).toBe('el-valor-secreto');
    expect(configMock.get).toHaveBeenCalledWith('TENANT_T1_WEBHOOK_SECRET');
  });

  it('getSecret tira un error si la referencia no existe', async () => {
    configMock.get.mockReturnValueOnce(undefined);

    await expect(service.getSecret('NO_EXISTE')).rejects.toThrow('Secret not found for ref: NO_EXISTE');
  });
});
