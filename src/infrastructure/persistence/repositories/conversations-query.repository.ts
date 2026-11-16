import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    ConversationPerson,
    ConversationsQueryPort,
    MessagePage,
    MessagePageQuery,
} from '../../../core/domain/ports/conversations-query-port/conversations-query.port.js';
import { ConversationMessageRole } from '../../../core/domain/entities/conversation-message.entity.js';
import { Person } from '../../../core/domain/entities/person.entity.js';
import { MessageSchema, StoredMessage } from '../schemas/message.schema.js';
import { PersonSchema } from '../schemas/person.schema.js';

const PREVIEW_LENGTH = 120;
const MAX_PEOPLE = 200;

interface PersonRow {
    id: string;
    phoneNumber: string;
    name: string | null;
    lastMessageAt: Date;
    lastMessagePreview: string;
}

// Cada persona con su último mensaje; las personas sin mensajes no aparecen.
const PEOPLE_SELECT = `
    SELECT p.id, p."phoneNumber", p.name, lm."createdAt" AS "lastMessageAt", left(lm.content, ${PREVIEW_LENGTH}) AS "lastMessagePreview"
    FROM "Person" p
    JOIN LATERAL (
        SELECT m."createdAt", m.content FROM "Message" m
        WHERE m."personId" = p.id
        ORDER BY m."createdAt" DESC, m.id DESC
        LIMIT 1
    ) lm ON true`;

@Injectable()
export class ConversationsQueryRepository implements ConversationsQueryPort {
    constructor(
        @InjectRepository(PersonSchema) private readonly people: Repository<Person>,
        @InjectRepository(MessageSchema) private readonly messages: Repository<StoredMessage>,
    ) {}

    async listPeople(search?: string): Promise<ConversationPerson[]> {
        const term = search?.trim();
        const rows: PersonRow[] = term
            ? await this.people.query(
                  `${PEOPLE_SELECT}
                   WHERE p."phoneNumber" ILIKE $1 OR p.name ILIKE $1
                   ORDER BY lm."createdAt" DESC LIMIT ${MAX_PEOPLE}`,
                  [`%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`],
              )
            : await this.people.query(`${PEOPLE_SELECT} ORDER BY lm."createdAt" DESC LIMIT ${MAX_PEOPLE}`);
        return rows.map((row) => this.toPerson(row));
    }

    async getPerson(personId: string): Promise<ConversationPerson | null> {
        const rows: PersonRow[] = await this.people.query(`${PEOPLE_SELECT} WHERE p.id = $1`, [personId]);
        return rows[0] ? this.toPerson(rows[0]) : null;
    }

    async listMessages(personId: string, query: MessagePageQuery): Promise<MessagePage> {
        const builder = this.messages
            .createQueryBuilder('message')
            .where('message.personId = :personId', { personId })
            .orderBy('message.createdAt', 'DESC')
            .addOrderBy('message.id', 'DESC')
            .take(query.limit + 1);

        if (query.from) {
            builder.andWhere('message.createdAt >= :from', { from: query.from });
        }
        if (query.to) {
            builder.andWhere('message.createdAt < :to', { to: query.to });
        }
        if (query.before) {
            builder.andWhere(
                '(message.createdAt < :beforeAt OR (message.createdAt = :beforeAt AND message.id < :beforeId))',
                { beforeAt: query.before.createdAt, beforeId: query.before.id },
            );
        }

        const rows = await builder.getMany();
        return {
            hasMore: rows.length > query.limit,
            items: rows.slice(0, query.limit).map((row) => ({
                id: row.id,
                personId: row.personId,
                role: row.role as ConversationMessageRole,
                text: row.content,
                timestamp: row.createdAt,
            })),
        };
    }

    private toPerson(row: PersonRow): ConversationPerson {
        return {
            id: row.id,
            phoneNumber: row.phoneNumber,
            name: row.name,
            lastMessageAt: new Date(row.lastMessageAt),
            lastMessagePreview: row.lastMessagePreview,
        };
    }
}
