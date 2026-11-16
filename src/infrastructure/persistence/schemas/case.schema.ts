import { EntitySchema } from 'typeorm';
import { CaseSource, CaseStatus } from '../../../core/domain/entities/case.entity.js';

/** Fila de la tabla `Case`. */
export interface StoredCase {
    id: string;
    personId: string;
    summary: string;
    status: CaseStatus;
    source: CaseSource;
    assignee: string | null;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt: Date | null;
}

export const CaseSchema = new EntitySchema<StoredCase>({
    name: 'Case',
    tableName: 'Case',
    columns: {
        id: { type: 'uuid', primary: true, generated: 'uuid' },
        personId: { type: 'uuid' },
        summary: { type: 'text' },
        status: { type: 'text', default: 'open' },
        source: { type: 'text' },
        assignee: { type: 'text', nullable: true },
        note: { type: 'text', nullable: true },
        createdAt: { type: 'timestamptz' },
        updatedAt: { type: 'timestamptz' },
        resolvedAt: { type: 'timestamptz', nullable: true },
    },
    indices: [
        { name: 'IDX_Case_status_createdAt', columns: ['status', 'createdAt'] },
        { name: 'IDX_Case_personId', columns: ['personId'] },
    ],
});
