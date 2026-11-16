import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CaseRecord, CaseStatus } from '../../../core/domain/entities/case.entity.js';
import { CasePatch, CasesPort, NewCase } from '../../../core/domain/ports/cases-port/cases.port.js';
import { CaseSchema, StoredCase } from '../schemas/case.schema.js';

const MAX_CASES = 200;
const ACTIVE_STATUSES = ['open', 'in_progress'];

interface CaseRow {
    id: string;
    personId: string;
    personName: string | null;
    personPhone: string;
    summary: string;
    status: CaseStatus;
    source: 'ai' | 'manual';
    assignee: string | null;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt: Date | null;
}

// Cada caso con el nombre y teléfono de su persona.
const CASE_SELECT = `
    SELECT c.id, c."personId", p.name AS "personName", p."phoneNumber" AS "personPhone", c.summary, c.status, c.source,
           c.assignee, c.note, c."createdAt", c."updatedAt", c."resolvedAt"
    FROM "Case" c
    JOIN "Person" p ON p.id = c."personId"`;

@Injectable()
export class CasesRepository implements CasesPort {
    constructor(@InjectRepository(CaseSchema) private readonly cases: Repository<StoredCase>) {}

    async create(input: NewCase): Promise<CaseRecord | null> {
        // INSERT ... SELECT: no inserta (y devuelve null) si la persona no existe, sin depender de un error de clave foránea.
        // ON CONFLICT DO NOTHING: si dos mensajes abren a la vez un caso automático, el segundo no inserta (devuelve null).
        const rows = (await this.cases.query(
            `INSERT INTO "Case" ("personId", "summary", "status", "source", "createdAt", "updatedAt")
             SELECT p.id, $2, 'open', $3, now(), now() FROM "Person" p WHERE p.id = $1
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [input.personId, input.summary, input.source],
        )) as { id: string }[];

        return rows[0] ? this.get(rows[0].id) : null;
    }

    async hasActiveCase(personId: string): Promise<boolean> {
        const rows = (await this.cases.query(
            `SELECT 1 FROM "Case" WHERE "personId" = $1 AND status = ANY($2::text[]) LIMIT 1`,
            [personId, ACTIVE_STATUSES],
        )) as unknown[];
        return rows.length > 0;
    }

    async list(status?: CaseStatus): Promise<CaseRecord[]> {
        const rows: CaseRow[] = status
            ? await this.cases.query(`${CASE_SELECT} WHERE c.status = $1 ORDER BY c."createdAt" DESC LIMIT ${MAX_CASES}`, [status])
            : await this.cases.query(`${CASE_SELECT} ORDER BY c."createdAt" DESC LIMIT ${MAX_CASES}`);
        return rows.map((row) => this.toRecord(row));
    }

    async get(id: string): Promise<CaseRecord | null> {
        const rows: CaseRow[] = await this.cases.query(`${CASE_SELECT} WHERE c.id = $1`, [id]);
        return rows[0] ? this.toRecord(rows[0]) : null;
    }

    async update(id: string, patch: CasePatch): Promise<CaseRecord | null> {
        const sets: string[] = ['"updatedAt" = now()'];
        const params: unknown[] = [id];

        if (patch.status !== undefined) {
            params.push(patch.status);
            sets.push(`status = $${params.length}`);
            // La fecha de resolución se fija al resolver (sin pisar una anterior) y se borra si el caso se reabre.
            sets.push(
                patch.status === 'resolved' ? `"resolvedAt" = COALESCE("resolvedAt", now())` : `"resolvedAt" = NULL`,
            );
        }
        if (patch.note !== undefined) {
            params.push(patch.note.trim() || null);
            sets.push(`note = $${params.length}`);
        }
        if (patch.assignee !== undefined) {
            params.push(patch.assignee.trim() || null);
            sets.push(`assignee = $${params.length}`);
        }

        const rows = (await this.cases.query(`UPDATE "Case" SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, params)) as {
            id: string;
        }[];
        return rows[0] ? this.get(id) : null;
    }

    private toRecord(row: CaseRow): CaseRecord {
        return {
            ...row,
            createdAt: new Date(row.createdAt),
            updatedAt: new Date(row.updatedAt),
            resolvedAt: row.resolvedAt ? new Date(row.resolvedAt) : null,
        };
    }
}
