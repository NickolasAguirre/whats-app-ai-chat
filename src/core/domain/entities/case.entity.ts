export type CaseStatus = 'open' | 'in_progress' | 'resolved';
export type CaseSource = 'ai' | 'manual';

export const CASE_STATUSES: readonly CaseStatus[] = ['open', 'in_progress', 'resolved'];

/** Un caso que el asistente no pudo resolver y que el call center atiende a mano. */
export interface CaseRecord {
    id: string;
    personId: string;
    personName: string | null;
    personPhone: string;
    summary: string;
    status: CaseStatus;
    source: CaseSource;
    assignee: string | null;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt: Date | null;
}
