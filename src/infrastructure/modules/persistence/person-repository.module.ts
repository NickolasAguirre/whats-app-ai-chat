import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersonRepository } from '../../persistence/repositories/person.repository.js';
import { PersonRepositoryPort } from '../../../core/domain/ports/person-port/person.port.js';
import { PersonSchema } from '../../persistence/schemas/person.schema.js';

@Module({
    imports: [TypeOrmModule.forFeature([PersonSchema])],
    providers: [
        PersonRepository,
        { provide: PersonRepositoryPort, useExisting: PersonRepository },
    ],
    exports: [PersonRepositoryPort],
})
export class PersonRepositoryModule {}
