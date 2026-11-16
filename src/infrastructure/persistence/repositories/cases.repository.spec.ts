import { CasesRepository } from './cases.repository.js';

const row = {
    id: 'c1',
    personId: 'p1',
    personName: null,
    personPhone: '+57300',
    summary: 'x',
    status: 'open',
    source: 'ai',
    assignee: null,
    note: null,
    createdAt: '2026-11-15T10:00:00Z',
    updatedAt: '2026-11-15T10:00:00Z',
    resolvedAt: null,
};

describe('CasesRepository', () => {
    const typeorm = { query: vi.fn() };
    const repository = new CasesRepository(typeorm as never);

    beforeEach(() => vi.resetAllMocks());

    it('create devuelve null y no consulta el caso si la persona no existe', async () => {
        typeorm.query.mockResolvedValueOnce([]);

        expect(await repository.create({ personId: 'p1', summary: 'x', source: 'ai' })).toBeNull();
        expect(typeorm.query).toHaveBeenCalledTimes(1);
        expect(typeorm.query.mock.calls[0][0]).toContain('WHERE p.id = $1');
    });

    it('create no falla ni duplica si otro caso automático se abrió a la vez (ON CONFLICT DO NOTHING)', async () => {
        typeorm.query.mockResolvedValueOnce([]);

        expect(await repository.create({ personId: 'p1', summary: 'x', source: 'ai' })).toBeNull();
        expect(typeorm.query.mock.calls[0][0]).toContain('ON CONFLICT DO NOTHING');
    });

    it('create inserta con origen y devuelve el caso con los datos de la persona', async () => {
        typeorm.query.mockResolvedValueOnce([{ id: 'c1' }]).mockResolvedValueOnce([row]);

        const created = await repository.create({ personId: 'p1', summary: 'x', source: 'manual' });

        expect(typeorm.query.mock.calls[0][1]).toEqual(['p1', 'x', 'manual']);
        expect(created?.createdAt).toEqual(new Date('2026-11-15T10:00:00Z'));
        expect(created?.resolvedAt).toBeNull();
    });

    it('hasActiveCase mira solo los estados abierto y en curso', async () => {
        typeorm.query.mockResolvedValue([{ '?column?': 1 }]);

        expect(await repository.hasActiveCase('p1')).toBe(true);
        expect(typeorm.query.mock.calls[0][1]).toEqual(['p1', ['open', 'in_progress']]);

        typeorm.query.mockResolvedValue([]);
        expect(await repository.hasActiveCase('p1')).toBe(false);
    });

    it('list filtra por estado y ordena del más nuevo al más antiguo', async () => {
        typeorm.query.mockResolvedValue([row]);

        await repository.list('resolved');
        await repository.list();

        expect(typeorm.query.mock.calls[0][0]).toContain('WHERE c.status = $1');
        expect(typeorm.query.mock.calls[0][1]).toEqual(['resolved']);
        expect(typeorm.query.mock.calls[1][0]).not.toContain('WHERE');
        expect(typeorm.query.mock.calls[1][0]).toContain('ORDER BY c."createdAt" DESC');
    });

    it('update al resolver fija resolvedAt sin pisar uno anterior y al reabrir lo borra', async () => {
        typeorm.query.mockResolvedValueOnce([{ id: 'c1' }]).mockResolvedValueOnce([row]);
        await repository.update('c1', { status: 'resolved' });
        expect(typeorm.query.mock.calls[0][0]).toContain('"resolvedAt" = COALESCE("resolvedAt", now())');

        typeorm.query.mockClear();
        typeorm.query.mockResolvedValueOnce([{ id: 'c1' }]).mockResolvedValueOnce([row]);
        await repository.update('c1', { status: 'open' });
        expect(typeorm.query.mock.calls[0][0]).toContain('"resolvedAt" = NULL');
    });

    it('update guarda texto vacío como nulo y no toca lo que no se envía', async () => {
        typeorm.query.mockResolvedValueOnce([{ id: 'c1' }]).mockResolvedValueOnce([row]);

        await repository.update('c1', { note: '   ' });

        const [sql, params] = typeorm.query.mock.calls[0] as [string, unknown[]];
        expect(params).toEqual(['c1', null]);
        expect(sql).toContain('note = $2');
        expect(sql).not.toContain('status');
        expect(sql).not.toContain('assignee');
    });

    it('update devuelve null si el caso no existe', async () => {
        typeorm.query.mockResolvedValueOnce([]);

        expect(await repository.update('nope', { status: 'resolved' })).toBeNull();
    });
});
