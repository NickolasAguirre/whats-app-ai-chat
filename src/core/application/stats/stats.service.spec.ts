import { StatsService } from './stats.service.js';

const totals = (answered: number, avgResponseSeconds = 0) => ({
    answered,
    received: answered + 1,
    people: 3,
    newPeople: 1,
    avgResponseSeconds,
});

describe('StatsService', () => {
    const query = {
        totals: vi.fn(),
        answeredByHour: vi.fn(),
        answeredByDay: vi.fn(),
        heatmap: vi.fn(),
    };
    const numbers = { list: vi.fn(), get: vi.fn() };
    const service = new StatsService(query as never, numbers as never);

    // 2026-11-15 es domingo; con tzOffset 300 (UTC-5) el reloj local marca las 15:00.
    const now = new Date('2026-11-15T20:00:00Z');
    const OFFSET = 300;

    beforeEach(() => {
        vi.resetAllMocks();
        query.totals.mockResolvedValue(totals(10, 3.14159));
        query.answeredByHour.mockResolvedValue(new Array(24).fill(0));
        query.answeredByDay.mockResolvedValue([]);
        query.heatmap.mockResolvedValue(Array.from({ length: 7 }, () => new Array(8).fill(0)));
        numbers.list.mockReturnValue([{ id: 'default', label: 'Ventas', phoneNumber: '+57300', wabaId: '', active: true }]);
    });

    it('semana: ventana de 7 días locales y periodo anterior del mismo tamaño y duración', async () => {
        await service.getDashboard('week', OFFSET, now);

        expect(query.totals).toHaveBeenNthCalledWith(1, new Date('2026-11-09T05:00:00Z'), now);
        expect(query.totals).toHaveBeenNthCalledWith(2, new Date('2026-11-02T05:00:00Z'), new Date('2026-11-08T20:00:00Z'));
    });

    it('día: 24 puntos por hora local y ventana desde la medianoche local hasta el fin del día', async () => {
        query.answeredByHour.mockResolvedValue(Array.from({ length: 24 }, (_, hour) => (hour === 9 ? 5 : 0)));

        const stats = await service.getDashboard('day', OFFSET, now);

        expect(query.answeredByHour).toHaveBeenCalledWith(
            new Date('2026-11-15T05:00:00Z'),
            new Date('2026-11-16T05:00:00Z'),
            OFFSET,
        );
        expect(stats.series).toHaveLength(24);
        expect(stats.series[9]).toEqual({ label: '9h', description: '9:00 a 9:59', value: 5 });
    });

    it('mes: 30 puntos, rellena con 0 los días sin respuestas y etiqueta con el día del mes', async () => {
        query.answeredByDay.mockResolvedValue([{ day: '2026-11-15', count: 7 }]);

        const stats = await service.getDashboard('month', OFFSET, now);

        expect(stats.series).toHaveLength(30);
        expect(stats.series[0].label).toBe('17');
        expect(stats.series.at(-1)).toEqual({ label: '15', description: 'domingo 15', value: 7 });
        expect(stats.series.filter((point) => point.value === 0)).toHaveLength(29);
    });

    it('semana: etiquetas por día de la semana', async () => {
        const stats = await service.getDashboard('week', OFFSET, now);

        expect(stats.series.map((point) => point.label)).toEqual(['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']);
    });

    it('redondea el tiempo de respuesta, deja los fallos en 0 y reparte por número configurado', async () => {
        const stats = await service.getDashboard('day', 0, now);

        expect(stats.summary).toMatchObject({ answered: 10, avgResponseSeconds: 3.1, failed: 0 });
        expect(stats.failedMessages).toEqual([]);
        expect(stats.byNumber).toEqual([{ numberId: 'default', label: 'Ventas', phoneNumber: '+57300', answered: 10 }]);
    });

    it('sin número configurado no hay filas por número', async () => {
        numbers.list.mockReturnValue([]);

        expect((await service.getDashboard('day', 0, now)).byNumber).toEqual([]);
    });

    it('el mapa de calor cubre las últimas 4 semanas', async () => {
        await service.getDashboard('day', OFFSET, now);

        expect(query.heatmap).toHaveBeenCalledWith(new Date('2026-10-19T05:00:00Z'), new Date('2026-11-16T05:00:00Z'), OFFSET);
    });
});
