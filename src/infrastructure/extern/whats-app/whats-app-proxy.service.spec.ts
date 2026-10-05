import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { WhatsAppService } from './whats-app-proxy.service.js';
import { WhatsAppNumberRepositoryPort } from '../../../core/domain/ports/whats-app-number-port/whats-app-number.port.js';
import { SecretsPort } from '../../../core/domain/ports/secrets-port/secrets.port.js';

describe('WhatsAppService', () => {
  let service: WhatsAppService;
  const httpMock = { post: vi.fn().mockReturnValue(of({})) };
  const whatsAppNumberRepoMock = { findByExternalId: vi.fn() };
  const secretsMock = { getSecret: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        { provide: HttpService, useValue: httpMock },
        { provide: WhatsAppNumberRepositoryPort, useValue: whatsAppNumberRepoMock },
        { provide: SecretsPort, useValue: secretsMock },
      ],
    }).compile();

    service = module.get<WhatsAppService>(WhatsAppService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('sendMessage resuelve la API key del tenant dueño del número "from" y la manda en el header', async () => {
    const whatsAppNumber = { id: 'w1', tenantId: 't1', ycloudApiKeySecretRef: 'REF_API' };
    whatsAppNumberRepoMock.findByExternalId.mockResolvedValueOnce(whatsAppNumber);
    secretsMock.getSecret.mockResolvedValueOnce('la-api-key-del-tenant');

    const message = { from: '+1999', to: '+1555', type: 'text', text: { body: 'hola' } } as any;
    await service.sendMessage(message);

    expect(whatsAppNumberRepoMock.findByExternalId).toHaveBeenCalledWith('+1999');
    expect(secretsMock.getSecret).toHaveBeenCalledWith('REF_API');
    expect(httpMock.post).toHaveBeenCalledWith(
      expect.any(String),
      message,
      { headers: expect.objectContaining({ 'X-API-Key': 'la-api-key-del-tenant' }) },
    );
  });
});
