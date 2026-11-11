import { EntitySchema } from 'typeorm';
import { Instructions } from '../../../core/domain/entities/instructions.entity.js';

export const InstructionsSchema = new EntitySchema<Instructions>({
    name: 'Instructions',
    tableName: 'Instructions',
    columns: {
        id: { type: 'uuid', primary: true, generated: 'uuid' },
        content: { type: 'text' },
        updatedAt: { type: 'timestamptz', updateDate: true },
    },
});
