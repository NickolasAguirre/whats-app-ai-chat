import { Instructions } from '../../entities/instructions.entity.js';

export abstract class InstructionsRepositoryPort {
    abstract getForTenant(tenantId: string): Promise<Instructions | null>;
}
