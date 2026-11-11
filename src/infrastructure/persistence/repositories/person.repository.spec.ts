import { PersonRepository } from './person.repository.js';

describe('PersonRepository', () => {
  const execute = vi.fn();
  const insertBuilder = { insert: vi.fn(), values: vi.fn(), orIgnore: vi.fn(), execute };
  const typeormMock = {
    createQueryBuilder: vi.fn(),
    findOneByOrFail: vi.fn(),
  };
  let repository: PersonRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    insertBuilder.insert.mockReturnValue(insertBuilder);
    insertBuilder.values.mockReturnValue(insertBuilder);
    insertBuilder.orIgnore.mockReturnValue(insertBuilder);
    typeormMock.createQueryBuilder.mockReturnValue(insertBuilder);
    repository = new PersonRepository(typeormMock as never);
  });

  it('findOrCreate inserta ignorando conflictos y devuelve la persona (nombre null pasa a undefined)', async () => {
    const row = { id: 'p1', phoneNumber: '+1555', name: null, createdAt: new Date() };
    typeormMock.findOneByOrFail.mockResolvedValueOnce(row);

    const result = await repository.findOrCreate('+1555');

    expect(insertBuilder.values).toHaveBeenCalledWith({ phoneNumber: '+1555', name: undefined });
    expect(insertBuilder.orIgnore).toHaveBeenCalled();
    expect(typeormMock.findOneByOrFail).toHaveBeenCalledWith({ phoneNumber: '+1555' });
    expect(result).toEqual({ id: 'p1', phoneNumber: '+1555', name: undefined, createdAt: row.createdAt });
  });

  it('findOrCreate devuelve el nombre cuando la persona lo tiene', async () => {
    const row = { id: 'p2', phoneNumber: '+1556', name: 'Nico', createdAt: new Date() };
    typeormMock.findOneByOrFail.mockResolvedValueOnce(row);

    const result = await repository.findOrCreate('+1556', 'Nico');

    expect(insertBuilder.values).toHaveBeenCalledWith({ phoneNumber: '+1556', name: 'Nico' });
    expect(result.name).toBe('Nico');
  });
});
