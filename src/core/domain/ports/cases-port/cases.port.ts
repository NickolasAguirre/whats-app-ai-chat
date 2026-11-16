import { CaseRecord, CaseSource, CaseStatus } from '../../entities/case.entity.js';

export interface NewCase {
    personId: string;
    summary: string;
    source: CaseSource;
}

export interface CasePatch {
    status?: CaseStatus;
    /** Cadena vacía borra el valor. */
    note?: string;
    assignee?: string;
}

export abstract class CasesPort {
    /** Devuelve `null` si la persona no existe. */
    abstract create(input: NewCase): Promise<CaseRecord | null>;
    abstract hasActiveCase(personId: string): Promise<boolean>;
    abstract list(status?: CaseStatus): Promise<CaseRecord[]>;
    abstract get(id: string): Promise<CaseRecord | null>;
    /** Devuelve `null` si el caso no existe. */
    abstract update(id: string, patch: CasePatch): Promise<CaseRecord | null>;
}
