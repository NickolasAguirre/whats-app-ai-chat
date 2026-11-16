import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Person } from '../../../core/domain/entities/person.entity.js';
import { DayCount, StatsQueryPort, WindowTotals } from '../../../core/domain/ports/stats-query-port/stats-query.port.js';
import { MessageSchema, StoredMessage } from '../schemas/message.schema.js';
import { PersonSchema } from '../schemas/person.schema.js';

// Hora local del mensaje como timestamp sin zona: UTC menos el desfase del navegador.
const LOCAL = `(("createdAt" AT TIME ZONE 'UTC') - make_interval(mins => $3::int))`;

interface Bucket {
    bucket: string | number;
    count: number;
}

@Injectable()
export class StatsQueryRepository implements StatsQueryPort {
    constructor(
        @InjectRepository(MessageSchema) private readonly messages: Repository<StoredMessage>,
        @InjectRepository(PersonSchema) private readonly people: Repository<Person>,
    ) {}

    async totals(from: Date, to: Date): Promise<WindowTotals> {
        const [counts] = (await this.messages.query(
            `SELECT count(*) FILTER (WHERE role = 'outbound')::int AS answered,
                    count(*) FILTER (WHERE role = 'inbound')::int AS received,
                    count(DISTINCT "personId")::int AS people
             FROM "Message" WHERE "createdAt" >= $1 AND "createdAt" < $2`,
            [from, to],
        )) as { answered: number; received: number; people: number }[];

        const [newPeople] = (await this.people.query(
            `SELECT count(*)::int AS count FROM "Person" WHERE "createdAt" >= $1 AND "createdAt" < $2`,
            [from, to],
        )) as { count: number }[];

        // Tiempo entre el mensaje entrante y la respuesta que lo sigue, por persona.
        const [response] = (await this.messages.query(
            `SELECT avg(extract(epoch FROM ("createdAt" - "previousAt")))::float AS seconds
             FROM (
                 SELECT role, "createdAt",
                        lag(role) OVER w AS "previousRole",
                        lag("createdAt") OVER w AS "previousAt"
                 FROM "Message" WHERE "createdAt" >= $1 AND "createdAt" < $2
                 WINDOW w AS (PARTITION BY "personId" ORDER BY "createdAt", id)
             ) ordered
             WHERE role = 'outbound' AND "previousRole" = 'inbound'`,
            [from, to],
        )) as { seconds: number | null }[];

        return {
            answered: counts.answered,
            received: counts.received,
            people: counts.people,
            newPeople: newPeople.count,
            avgResponseSeconds: response.seconds ?? 0,
        };
    }

    async answeredByHour(from: Date, to: Date, offsetMinutes: number): Promise<number[]> {
        const rows = await this.bucketed(`extract(hour FROM ${LOCAL})::int`, from, to, offsetMinutes);
        const hours = new Array<number>(24).fill(0);
        for (const row of rows) {
            hours[Number(row.bucket)] = row.count;
        }
        return hours;
    }

    async answeredByDay(from: Date, to: Date, offsetMinutes: number): Promise<DayCount[]> {
        const rows = await this.bucketed(`to_char(${LOCAL}, 'YYYY-MM-DD')`, from, to, offsetMinutes);
        return rows.map((row) => ({ day: String(row.bucket), count: row.count }));
    }

    async heatmap(from: Date, to: Date, offsetMinutes: number): Promise<number[][]> {
        const rows = (await this.messages.query(
            `SELECT (extract(isodow FROM ${LOCAL})::int - 1) AS weekday,
                    (extract(hour FROM ${LOCAL})::int / 3) AS block,
                    count(*)::int AS count
             FROM "Message" WHERE role = 'outbound' AND "createdAt" >= $1 AND "createdAt" < $2
             GROUP BY 1, 2`,
            [from, to, offsetMinutes],
        )) as { weekday: number; block: number; count: number }[];

        const grid = Array.from({ length: 7 }, () => new Array<number>(8).fill(0));
        for (const row of rows) {
            grid[row.weekday][row.block] = row.count;
        }
        return grid;
    }

    private bucketed(expression: string, from: Date, to: Date, offsetMinutes: number): Promise<Bucket[]> {
        return this.messages.query(
            `SELECT ${expression} AS bucket, count(*)::int AS count
             FROM "Message" WHERE role = 'outbound' AND "createdAt" >= $1 AND "createdAt" < $2
             GROUP BY 1`,
            [from, to, offsetMinutes],
        ) as Promise<Bucket[]>;
    }
}
