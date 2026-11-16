import { StatsQueryRepository } from './stats-query.repository.js';

describe('StatsQueryRepository', () => {
    const messages = { query: vi.fn() };
    const people = { query: vi.fn() };
    const repository = new StatsQueryRepository(messages as never, people as never);
    const from = new Date('2026-11-09T05:00:00Z');
    const to = new Date('2026-11-16T05:00:00Z');

    beforeEach(() => vi.resetAllMocks());

    it('totals junta conteos, personas nuevas y tiempo de respuesta; sin respuestas el promedio es 0', async () => {
        messages.query
            .mockResolvedValueOnce([{ answered: 4, received: 5, people: 2 }])
            .mockResolvedValueOnce([{ seconds: null }]);
        people.query.mockResolvedValue([{ count: 1 }]);

        const result = await repository.totals(from, to);

        expect(result).toEqual({ answered: 4, received: 5, people: 2, newPeople: 1, avgResponseSeconds: 0 });
        expect(messages.query.mock.calls[0][1]).toEqual([from, to]);
        expect(messages.query.mock.calls[1][0]).toContain("role = 'outbound' AND \"previousRole\" = 'inbound'");
    });

    it('answeredByHour rellena las 24 horas y pasa el desfase como parámetro', async () => {
        messages.query.mockResolvedValue([{ bucket: 9, count: 5 }]);

        const hours = await repository.answeredByHour(from, to, 300);

        expect(hours).toHaveLength(24);
        expect(hours[9]).toBe(5);
        expect(hours.reduce((sum, value) => sum + value, 0)).toBe(5);
        expect(messages.query.mock.calls[0][1]).toEqual([from, to, 300]);
        expect(messages.query.mock.calls[0][0]).toContain("role = 'outbound'");
    });

    it('answeredByDay devuelve día local y conteo', async () => {
        messages.query.mockResolvedValue([{ bucket: '2026-11-15', count: 7 }]);

        expect(await repository.answeredByDay(from, to, 0)).toEqual([{ day: '2026-11-15', count: 7 }]);
    });

    it('heatmap devuelve una grilla de 7 días por 8 bloques con lunes primero', async () => {
        messages.query.mockResolvedValue([{ weekday: 0, block: 3, count: 6 }, { weekday: 6, block: 7, count: 2 }]);

        const grid = await repository.heatmap(from, to, 0);

        expect(grid).toHaveLength(7);
        expect(grid.every((row) => row.length === 8)).toBe(true);
        expect(grid[0][3]).toBe(6);
        expect(grid[6][7]).toBe(2);
    });
});
