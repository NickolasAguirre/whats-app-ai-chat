import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PersonRepositoryPort } from '../../../core/domain/ports/person-port/person.port.js';
import { Person } from '../../../core/domain/entities/person.entity.js';
import { PersonSchema } from '../schemas/person.schema.js';

@Injectable()
export class PersonRepository implements PersonRepositoryPort {
    constructor(@InjectRepository(PersonSchema) private readonly repository: Repository<Person>) {}

    async findOrCreate(phoneNumber: string, name?: string): Promise<Person> {
        // INSERT ... ON CONFLICT DO NOTHING: es atómico si dos mensajes de la misma persona llegan a la vez.
        await this.repository
            .createQueryBuilder()
            .insert()
            .values({ phoneNumber, name } as Partial<Person>)
            .orIgnore()
            .execute();

        const person = await this.repository.findOneByOrFail({ phoneNumber });
        return this.toPerson(person);
    }

    private toPerson(data: Person): Person {
        return {
            id: data.id,
            phoneNumber: data.phoneNumber,
            name: data.name ?? undefined,
            createdAt: data.createdAt,
        };
    }
}
