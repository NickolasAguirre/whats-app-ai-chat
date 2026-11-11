import { Instructions } from '../../entities/instructions.entity.js';

export abstract class InstructionsRepositoryPort {
    abstract get(): Promise<Instructions | null>;
    /** Guarda las instrucciones activas. Nunca deja más de una fila, ni con llamadas concurrentes. */
    abstract save(content: string): Promise<Instructions>;
    abstract delete(): Promise<void>;
}
