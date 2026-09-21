import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service.js';
import { InstructionsPrismaRepository } from './instructions-prisma.repository.js';

describe('InstructionsPrismaRepository', () => {
  let repository: InstructionsPrismaRepository;
  const prismaMock = {
    instructions: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstructionsPrismaRepository,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    repository = module.get<InstructionsPrismaRepository>(InstructionsPrismaRepository);
  });

  it('getForTenant devuelve null si el tenant no tiene instrucciones', async () => {
    prismaMock.instructions.findUnique.mockResolvedValueOnce(null);

    const result = await repository.getForTenant('t1');

    expect(result).toBeNull();
  });

  it('getForTenant devuelve las instrucciones del tenant', async () => {
    const record = { id: 'i1', tenantId: 't1', content: 'Sos el asistente de Acme.', updatedAt: new Date() };
    prismaMock.instructions.findUnique.mockResolvedValueOnce(record);

    const result = await repository.getForTenant('t1');

    expect(result).toEqual(record);
    expect(prismaMock.instructions.findUnique).toHaveBeenCalledWith({ where: { tenantId: 't1' } });
  });
});
