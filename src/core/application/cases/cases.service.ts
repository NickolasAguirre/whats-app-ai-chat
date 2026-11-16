import { Inject, Injectable } from '@nestjs/common';
import { CaseRecord, CaseStatus } from '../../domain/entities/case.entity.js';
import { CasePatch, CasesPort } from '../../domain/ports/cases-port/cases.port.js';

@Injectable()
export class CasesService {
    constructor(@Inject(CasesPort) private readonly cases: CasesPort) {}

    /** Abre un caso por orden del asistente, salvo que la persona ya tenga uno abierto o en curso. */
    async openFromAi(personId: string, summary: string): Promise<CaseRecord | null> {
        if (await this.cases.hasActiveCase(personId)) {
            return null;
        }
        return this.cases.create({ personId, summary, source: 'ai' });
    }

    /** Un agente registra el caso a mano. `null` si la persona no existe. */
    registerManual(personId: string, summary: string): Promise<CaseRecord | null> {
        return this.cases.create({ personId, summary, source: 'manual' });
    }

    list(status?: CaseStatus): Promise<CaseRecord[]> {
        return this.cases.list(status);
    }

    get(id: string): Promise<CaseRecord | null> {
        return this.cases.get(id);
    }

    update(id: string, patch: CasePatch): Promise<CaseRecord | null> {
        return this.cases.update(id, patch);
    }
}
