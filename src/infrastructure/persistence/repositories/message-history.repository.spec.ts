import { MessageHistoryRepository } from './message-history.repository.js';

describe('MessageHistoryRepository', () => {
  const insertBuilder = { insert: vi.fn(), values: vi.fn(), orIgnore: vi.fn(), returning: vi.fn(), execute: vi.fn() };
  const selectBuilder = { where: vi.fn(), orderBy: vi.fn(), addOrderBy: vi.fn(), take: vi.fn(), andWhere: vi.fn(), getMany: vi.fn() };
  const typeormMock = { createQueryBuilder: vi.fn(), delete: vi.fn() };
  let repository: MessageHistoryRepository;

  beforeEach(() => {
    vi.resetAllMocks();
    for (const name of ['insert', 'values', 'orIgnore', 'returning'] as const) {
      insertBuilder[name].mockReturnValue(insertBuilder);
    }
    for (const name of ['where', 'orderBy', 'addOrderBy', 'take', 'andWhere'] as const) {
      selectBuilder[name].mockReturnValue(selectBuilder);
    }
    typeormMock.createQueryBuilder.mockImplementation((alias?: string) => (alias ? selectBuilder : insertBuilder));
    repository = new MessageHistoryRepository(typeormMock as never);
  });

  const createdAt = new Date('2026-11-10T10:00:00Z');

  it('save inserta ignorando conflictos y devuelve el id del mensaje nuevo', async () => {
    insertBuilder.execute.mockResolvedValue({ raw: [{ id: 'm1' }] });

    const id = await repository.save({ personId: 'p1', role: 'inbound', content: 'hola', providerMessageId: 'wamid.1', createdAt });

    expect(insertBuilder.values).toHaveBeenCalledWith({ personId: 'p1', role: 'inbound', content: 'hola', providerMessageId: 'wamid.1', createdAt });
    expect(insertBuilder.orIgnore).toHaveBeenCalled();
    expect(id).toBe('m1');
  });

  it('save devuelve null cuando el providerMessageId ya existía (no se insertó nada)', async () => {
    insertBuilder.execute.mockResolvedValue({ raw: [] });

    expect(await repository.save({ personId: 'p1', role: 'inbound', content: 'hola', providerMessageId: 'wamid.1', createdAt })).toBeNull();
  });

  it('save sin providerMessageId inserta null', async () => {
    insertBuilder.execute.mockResolvedValue({ raw: [{ id: 'm2' }] });

    await repository.save({ personId: 'p1', role: 'outbound', content: 'respuesta', createdAt });

    expect(insertBuilder.values).toHaveBeenCalledWith(expect.objectContaining({ providerMessageId: null }));
  });

  it('findRecent devuelve en orden cronológico, limita y mapea a ConversationMessage', async () => {
    const newest = { id: 'b', role: 'outbound', content: 'segundo', createdAt: new Date('2026-11-10T10:01:00Z') };
    const oldest = { id: 'a', role: 'inbound', content: 'primero', createdAt };
    selectBuilder.getMany.mockResolvedValue([newest, oldest]);

    const result = await repository.findRecent('p1', 20);

    expect(selectBuilder.take).toHaveBeenCalledWith(20);
    expect(selectBuilder.andWhere).not.toHaveBeenCalled();
    expect(result).toEqual([
      { role: 'inbound', text: 'primero', timestamp: createdAt },
      { role: 'outbound', text: 'segundo', timestamp: newest.createdAt },
    ]);
  });

  it('findRecent excluye el mensaje indicado', async () => {
    selectBuilder.getMany.mockResolvedValue([]);

    await repository.findRecent('p1', 20, 'm1');

    expect(selectBuilder.andWhere).toHaveBeenCalledWith('message.id <> :excludeId', { excludeId: 'm1' });
  });
  it('discard borra el mensaje por id', async () => {
    await repository.discard('m1');

    expect(typeormMock.delete).toHaveBeenCalledWith({ id: 'm1' });
  });
});
