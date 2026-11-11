import { EntitySchema } from 'typeorm';
import { Person } from '../../../core/domain/entities/person.entity.js';

export const PersonSchema = new EntitySchema<Person>({
    name: 'Person',
    tableName: 'Person',
    columns: {
        id: { type: 'uuid', primary: true, generated: 'uuid' },
        phoneNumber: { type: 'text', unique: true },
        name: { type: 'text', nullable: true },
        createdAt: { type: 'timestamptz', createDate: true },
    },
});
