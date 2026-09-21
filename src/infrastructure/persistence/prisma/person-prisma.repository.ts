import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { PersonRepositoryPort } from '../../../core/domain/ports/person-port/person.port.js';
import { Person } from '../../../core/domain/entities/person.entity.js';

@Injectable()
export class PersonPrismaRepository implements PersonRepositoryPort {
    constructor(private readonly prisma: PrismaService) {}

    async findOrCreate(tenantId: string, phoneNumber: string, name?: string): Promise<Person> {
        const existing = await this.prisma.person.findUnique({
            where: { tenantId_phoneNumber: { tenantId, phoneNumber } },
        });

        if (existing) {
            return this.toPerson(existing);
        }

        const created = await this.prisma.person.create({
            data: { tenantId, phoneNumber, name },
        });
        return this.toPerson(created);
    }

    private toPerson(data: any): Person {
        return {
            id: data.id,
            tenantId: data.tenantId,
            phoneNumber: data.phoneNumber,
            name: data.name ?? undefined,
            createdAt: data.createdAt,
        };
    }
}
