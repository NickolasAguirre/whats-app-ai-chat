import { InstructionsRepository } from './instructions.repository.js';

describe('InstructionsRepository', () => {
  const typeormMock = { find: vi.fn(), query: vi.fn(), findOneByOrFail: vi.fn() };
  let repository: InstructionsRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new InstructionsRepository(typeormMock as never);
  });

  it('get devuelve null si no hay instrucciones', async () => {
    typeormMock.find.mockResolvedValueOnce([]);

    expect(await repository.get()).toBeNull();
  });

  it('get devuelve la única fila de instrucciones', async () => {
    const record = { id: 'i1', content: 'Sos el asistente de Acme.', updatedAt: new Date() };
    typeormMock.find.mockResolvedValueOnce([record]);

    expect(await repository.get()).toEqual(record);
    expect(typeormMock.find).toHaveBeenCalledWith({ take: 1 });
  });

  it('save hace un UPSERT sobre un id fijo y descarta filas con otro id', async () => {
    const saved = { id: '00000000-0000-0000-0000-000000000001', content: 'Nuevo', updatedAt: new Date() };
    typeormMock.findOneByOrFail.mockResolvedValueOnce(saved);

    expect(await repository.save('Nuevo')).toEqual(saved);

    const [deleteSql, deleteParams] = typeormMock.query.mock.calls[0];
    const [upsertSql, upsertParams] = typeormMock.query.mock.calls[1];
    expect(deleteSql).toContain('DELETE FROM "Instructions" WHERE "id" <>');
    expect(deleteParams).toEqual(['00000000-0000-0000-0000-000000000001']);
    expect(upsertSql).toContain('ON CONFLICT ("id") DO UPDATE');
    expect(upsertParams).toEqual(['00000000-0000-0000-0000-000000000001', 'Nuevo']);
  });

  it('delete borra todas las filas', async () => {
    await repository.delete();

    expect(typeormMock.query).toHaveBeenCalledWith('DELETE FROM "Instructions"');
  });
});
