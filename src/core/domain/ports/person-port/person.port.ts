import { Person } from '../../entities/person.entity.js';

export abstract class PersonRepositoryPort {
    abstract findOrCreate(phoneNumber: string, name?: string): Promise<Person>;
}
