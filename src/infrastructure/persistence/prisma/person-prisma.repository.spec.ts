import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service.js';
import { PersonPrismaRepository } from './person-prisma.repository.js';

describe('PersonPrismaRepository', () => {
  let repository: PersonPrismaRepository;
  const prismaMock = {
    person: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonPrismaRepository,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    repository = module.get<PersonPrismaRepository>(PersonPrismaRepository);
  });

  it('findOrCreate devuelve la persona existente si ya está', async () => {
    const existing = { id: 'p1', tenantId: 't1', phoneNumber: '+1555', name: null, createdAt: new Date() };
    prismaMock.person.findUnique.mockResolvedValueOnce(existing);

    const result = await repository.findOrCreate('t1', '+1555');

    expect(result).toEqual({ id: 'p1', tenantId: 't1', phoneNumber: '+1555', name: undefined, createdAt: existing.createdAt });
    expect(prismaMock.person.create).not.toHaveBeenCalled();
  });

  it('findOrCreate crea la persona si no existe', async () => {
    const created = { id: 'p2', tenantId: 't1', phoneNumber: '+1556', name: 'Nico', createdAt: new Date() };
    prismaMock.person.findUnique.mockResolvedValueOnce(null);
    prismaMock.person.create.mockResolvedValueOnce(created);

    const result = await repository.findOrCreate('t1', '+1556', 'Nico');

    expect(result).toEqual(created);
    expect(prismaMock.person.create).toHaveBeenCalledWith({
      data: { tenantId: 't1', phoneNumber: '+1556', name: 'Nico' },
    });
  });
});
