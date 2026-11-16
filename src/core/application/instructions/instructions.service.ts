import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_INSTRUCTIONS } from '../../domain/default-instructions.js';
import { InstructionsRepositoryPort } from '../../domain/ports/instructions-port/instructions.port.js';

export interface EffectiveInstructions {
    content: string;
    updatedAt: Date | null;
    isDefault: boolean;
}

@Injectable()
export class InstructionsService {
    constructor(@Inject(InstructionsRepositoryPort) private readonly instructions: InstructionsRepositoryPort) {}

    /** Las instrucciones del cliente o, si no definió ninguna, las del comportamiento por defecto. */
    async getEffective(): Promise<EffectiveInstructions> {
        const saved = await this.instructions.get();

        return saved
            ? { content: saved.content, updatedAt: saved.updatedAt, isDefault: false }
            : { content: DEFAULT_INSTRUCTIONS,  updatedAt: null, isDefault: true };
    }

    async save(content: string): Promise<EffectiveInstructions> {
        const saved = await this.instructions.save(content);
        return { content: saved.content, updatedAt: saved.updatedAt, isDefault: false };
    }

    async reset(): Promise<void> {
        await this.instructions.delete();
    }
}
