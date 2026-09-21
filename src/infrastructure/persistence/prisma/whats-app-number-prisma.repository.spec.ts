import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service.js';
import { WhatsAppNumberPrismaRepository } from './whats-app-number-prisma.repository.js';

describe('WhatsAppNumberPrismaRepository', () => {
  let repository: WhatsAppNumberPrismaRepository;
  const prismaMock = {
    whatsAppNumber: {
      findFirst: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppNumberPrismaRepository,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    repository = module.get<WhatsAppNumberPrismaRepository>(WhatsAppNumberPrismaRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('findByExternalId busca por wabaId o phoneNumber y devuelve null si no existe', async () => {
    prismaMock.whatsAppNumber.findFirst.mockResolvedValueOnce(null);

    const result = await repository.findByExternalId('unknown-waba-id');

    expect(result).toBeNull();
    expect(prismaMock.whatsAppNumber.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ wabaId: 'unknown-waba-id' }, { phoneNumber: 'unknown-waba-id' }] },
    });
  });

  it('findByExternalId devuelve el WhatsAppNumber encontrado', async () => {
    const record = {
      id: 'w1', tenantId: 't1', phoneNumber: '+15551234567', wabaId: 'waba1',
      ycloudApiKeySecretRef: 'REF_API', webhookSecretRef: 'REF_WEBHOOK', active: true,
    };
    prismaMock.whatsAppNumber.findFirst.mockResolvedValueOnce(record);

    const result = await repository.findByExternalId('waba1');

    expect(result).toEqual(record);
  });
});
