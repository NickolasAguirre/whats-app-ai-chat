import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstructionsRepositoryPort } from '../../../core/domain/ports/instructions-port/instructions.port.js';
import { Instructions } from '../../../core/domain/entities/instructions.entity.js';
import { InstructionsSchema } from '../schemas/instructions.schema.js';

// Id fijo: con un UPSERT sobre la clave primaria nunca hay más de una fila, aunque lleguen dos guardados a la vez.
const ACTIVE_INSTRUCTIONS_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class InstructionsRepository implements InstructionsRepositoryPort {
    constructor(@InjectRepository(InstructionsSchema) private readonly repository: Repository<Instructions>) {}

    async get(): Promise<Instructions | null> {
        const [instructions] = await this.repository.find({ take: 1 });
        return instructions ?? null;
    }

    async save(content: string): Promise<Instructions> {
        // Se descartan filas heredadas con otro id y se inserta o actualiza la activa en una sola sentencia.
        await this.repository.query(`DELETE FROM "Instructions" WHERE "id" <> $1`, [ACTIVE_INSTRUCTIONS_ID]);
        await this.repository.query(
            `INSERT INTO "Instructions" ("id", "content") VALUES ($1, $2)
             ON CONFLICT ("id") DO UPDATE SET "content" = EXCLUDED."content", "updatedAt" = now()`,
            [ACTIVE_INSTRUCTIONS_ID, content],
        );
        return this.repository.findOneByOrFail({ id: ACTIVE_INSTRUCTIONS_ID });
    }

    async delete(): Promise<void> {
        await this.repository.query(`DELETE FROM "Instructions"`);
    }
}
