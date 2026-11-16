import { ConversationsQueryRepository } from './conversations-query.repository.js';

const PERSON_ID = '11111111-1111-4111-8111-111111111111';

function row(id: string, minute: number) {
    return { id, personId: PERSON_ID, role: 'inbound', content: `c${id}`, createdAt: new Date(Date.UTC(2026, 10, 15, 10, minute)) };
}

// Constructor de consultas falso: registra cada condición para comprobar los límites del rango y del cursor.
function fakeBuilder(rows: unknown[]) {
    const builder = {
        where: vi.fn(() => builder),
        andWhere: vi.fn(() => builder),
        orderBy: vi.fn(() => builder),
        addOrderBy: vi.fn(() => builder),
        take: vi.fn(() => builder),
        getMany: vi.fn(async () => rows),
    };
    return builder;
}

describe('ConversationsQueryRepository', () => {
    const people = { query: vi.fn() };
    const messages = { createQueryBuilder: vi.fn() };
    const repository = new ConversationsQueryRepository(people as never, messages as never);

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('pide limit + 1 filas, ordena del más reciente al más antiguo con desempate por id y recorta a limit', async () => {
        const builder = fakeBuilder([row('c', 3), row('b', 2), row('a', 1)]);
        messages.createQueryBuilder.mockReturnValue(builder);

        const page = await repository.listMessages(PERSON_ID, { limit: 2 });

        expect(builder.take).toHaveBeenCalledWith(3);
        expect(builder.orderBy).toHaveBeenCalledWith('message.createdAt', 'DESC');
        expect(builder.addOrderBy).toHaveBeenCalledWith('message.id', 'DESC');
        expect(page.items.map((item) => item.id)).toEqual(['c', 'b']);
        expect(page.hasMore).toBe(true);
    });

    it('hasMore es falso cuando hay exactamente limit filas', async () => {
        messages.createQueryBuilder.mockReturnValue(fakeBuilder([row('b', 2), row('a', 1)]));

        const page = await repository.listMessages(PERSON_ID, { limit: 2 });

        expect(page.hasMore).toBe(false);
        expect(page.items).toHaveLength(2);
    });

    it('from es inclusivo, to es exclusivo y el cursor trae solo filas estrictamente anteriores', async () => {
        const builder = fakeBuilder([]);
        messages.createQueryBuilder.mockReturnValue(builder);
        const from = new Date('2026-11-15T00:00:00Z');
        const to = new Date('2026-11-16T00:00:00Z');
        const before = { createdAt: new Date('2026-11-15T10:00:00Z'), id: PERSON_ID };

        await repository.listMessages(PERSON_ID, { from, to, before, limit: 30 });

        expect(builder.andWhere).toHaveBeenCalledWith('message.createdAt >= :from', { from });
        expect(builder.andWhere).toHaveBeenCalledWith('message.createdAt < :to', { to });
        expect(builder.andWhere).toHaveBeenCalledWith(
            '(message.createdAt < :beforeAt OR (message.createdAt = :beforeAt AND message.id < :beforeId))',
            { beforeAt: before.createdAt, beforeId: before.id },
        );
    });

    it('sin rango ni cursor no agrega condiciones extra', async () => {
        const builder = fakeBuilder([]);
        messages.createQueryBuilder.mockReturnValue(builder);

        await repository.listMessages(PERSON_ID, { limit: 30 });

        expect(builder.andWhere).not.toHaveBeenCalled();
    });

    it('la búsqueda escapa % y _ para que coincidan literalmente', async () => {
        people.query.mockResolvedValue([]);

        await repository.listPeople(' 50%_x ');

        const [sql, params] = people.query.mock.calls[0] as [string, string[]];
        expect(sql).toContain('ILIKE $1');
        expect(params).toEqual(['%50\\%\\_x%']);
    });

    it('sin búsqueda no manda parámetros y convierte las filas a personas', async () => {
        people.query.mockResolvedValue([
            { id: PERSON_ID, phoneNumber: '+57300', name: null, lastMessageAt: '2026-11-15T10:00:00Z', lastMessagePreview: 'hola' },
        ]);

        const result = await repository.listPeople();

        expect(people.query).toHaveBeenCalledWith(expect.not.stringContaining('ILIKE'));
        expect(result[0].lastMessageAt).toEqual(new Date('2026-11-15T10:00:00Z'));
    });

    it('getPerson devuelve null si no hay fila', async () => {
        people.query.mockResolvedValue([]);

        expect(await repository.getPerson(PERSON_ID)).toBeNull();
    });
});
