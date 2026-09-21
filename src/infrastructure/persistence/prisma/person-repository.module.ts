import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module.js';
import { PersonPrismaRepository } from './person-prisma.repository.js';
import { PersonRepositoryPort } from '../../../core/domain/ports/person-port/person.port.js';

@Module({
    imports: [PrismaModule],
    providers: [
        PersonPrismaRepository,
        { provide: PersonRepositoryPort, useExisting: PersonPrismaRepository },
    ],
    exports: [PersonRepositoryPort],
})
export class PersonRepositoryModule {}
