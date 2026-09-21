import { Person } from '../../entities/person.entity.js';

export abstract class PersonRepositoryPort {
    abstract findOrCreate(tenantId: string, phoneNumber: string, name?: string): Promise<Person>;
}
