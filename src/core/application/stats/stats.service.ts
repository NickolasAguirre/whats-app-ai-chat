import { Inject, Injectable } from '@nestjs/common';
import { NumbersPort } from '../../domain/ports/numbers-port/numbers.port.js';
import { StatsQueryPort, WindowTotals } from '../../domain/ports/stats-query-port/stats-query.port.js';

export type StatsPeriod = 'day' | 'week' | 'month';

export interface StatsPoint {
    label: string;
    description: string;
    value: number;
}

export interface DashboardStats {
    period: StatsPeriod;
    summary: WindowTotals & { failed: number };
    previous: { answered: number; people: number; avgResponseSeconds: number; failed: number };
    series: StatsPoint[];
    byNumber: { numberId: string; label: string; phoneNumber: string; answered: number }[];
    /** Respuestas de las últimas 4 semanas: 7 días (lunes primero) por 8 bloques de 3 horas. */
    heatmap: number[][];
    /** El bot todavía no guarda los fallos, así que siempre va vacío. */
    failedMessages: never[];
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DAYS: Record<StatsPeriod, number> = { day: 1, week: 7, month: 30 };
const HEATMAP_DAYS = 28;
const WEEKDAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const WEEKDAY_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

@Injectable()
export class StatsService {
    constructor(
        @Inject(StatsQueryPort) private readonly query: StatsQueryPort,
        @Inject(NumbersPort) private readonly numbers: NumbersPort,
    ) {}

    /**
     * `offsetMinutes` es el `getTimezoneOffset()` del navegador. Las fechas "locales" se manejan como instantes UTC
     * desplazados, de modo que sus campos UTC son la hora del reloj del usuario.
     */
    async getDashboard(period: StatsPeriod, offsetMinutes: number, now: Date = new Date()): Promise<DashboardStats> {
        const toLocal = (date: Date) => new Date(date.getTime() - offsetMinutes * MINUTE_MS);
        const toInstant = (local: Date) => new Date(local.getTime() + offsetMinutes * MINUTE_MS);

        const localNow = toLocal(now);
        const localToday = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()));
        const days = DAYS[period];
        const localStart = new Date(localToday.getTime() - (days - 1) * DAY_MS);

        const from = toInstant(localStart);
        const previousFrom = new Date(from.getTime() - days * DAY_MS);
        const previousTo = new Date(now.getTime() - days * DAY_MS);
        const heatmapFrom = toInstant(new Date(localToday.getTime() - (HEATMAP_DAYS - 1) * DAY_MS));
        const endOfToday = toInstant(new Date(localToday.getTime() + DAY_MS));

        const [totals, previous, series, heatmap] = await Promise.all([
            this.query.totals(from, now),
            this.query.totals(previousFrom, previousTo),
            period === 'day'
                ? this.hourSeries(from, endOfToday, offsetMinutes)
                : this.daySeries(period, localStart, days, from, endOfToday, offsetMinutes),
            this.query.heatmap(heatmapFrom, endOfToday, offsetMinutes),
        ]);

        return {
            period,
            summary: { ...totals, avgResponseSeconds: round1(totals.avgResponseSeconds), failed: 0 },
            previous: {
                answered: previous.answered,
                people: previous.people,
                avgResponseSeconds: round1(previous.avgResponseSeconds),
                failed: 0,
            },
            series,
            byNumber: this.numbers.list().map((number) => ({
                numberId: number.id,
                label: number.label,
                phoneNumber: number.phoneNumber,
                answered: totals.answered,
            })),
            heatmap,
            failedMessages: [],
        };
    }

    private async hourSeries(from: Date, to: Date, offsetMinutes: number): Promise<StatsPoint[]> {
        const hours = await this.query.answeredByHour(from, to, offsetMinutes);
        return hours.map((value, hour) => ({ label: `${hour}h`, description: `${hour}:00 a ${hour}:59`, value }));
    }

    private async daySeries(
        period: StatsPeriod,
        localStart: Date,
        days: number,
        from: Date,
        to: Date,
        offsetMinutes: number,
    ): Promise<StatsPoint[]> {
        const counts = new Map((await this.query.answeredByDay(from, to, offsetMinutes)).map((entry) => [entry.day, entry.count]));

        return Array.from({ length: days }, (_, index) => {
            const date = new Date(localStart.getTime() + index * DAY_MS);
            const weekday = date.getUTCDay();
            const key = date.toISOString().slice(0, 10);
            return {
                label: period === 'week' ? WEEKDAY_SHORT[weekday] : String(date.getUTCDate()),
                description: `${WEEKDAY_LONG[weekday]} ${date.getUTCDate()}`,
                value: counts.get(key) ?? 0,
            };
        });
    }
}

function round1(value: number): number {
    return Math.round(value * 10) / 10;
}
