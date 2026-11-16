import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationMessage } from '../../../core/domain/entities/conversation-message.entity.js';
import { MessageHistoryPort, NewHistoryMessage } from '../../../core/domain/ports/message-history-port/message-history.port.js';
import { MessageSchema, StoredMessage } from '../schemas/message.schema.js';

@Injectable()
export class MessageHistoryRepository implements MessageHistoryPort {
    constructor(@InjectRepository(MessageSchema) private readonly repository: Repository<StoredMessage>) {}

    async save(message: NewHistoryMessage): Promise<string | null> {
        // INSERT ... ON CONFLICT DO NOTHING: un reenvío del webhook (mismo providerMessageId) no inserta nada.
        const result = await this.repository
            .createQueryBuilder()
            .insert()
            .values({
                personId: message.personId,
                role: message.role,
                content: message.content,
                providerMessageId: message.providerMessageId ?? null,
                createdAt: message.createdAt,
            })
            .orIgnore()
            .returning('id')
            .execute();

        const raw = result.raw as { id: string }[];
        return raw[0]?.id ?? null;
    }

    async discard(id: string): Promise<void> {
        await this.repository.delete({ id });
    }

    async findRecent(personId: string, limit: number, excludeId?: string): Promise<ConversationMessage[]> {
        const query = this.repository
            .createQueryBuilder('message')
            .where('message.personId = :personId', { personId })
            .orderBy('message.createdAt', 'DESC')
            .addOrderBy('message.id', 'DESC')
            .take(limit);

        if (excludeId) {
            query.andWhere('message.id <> :excludeId', { excludeId });
        }

        const rows = await query.getMany();
        return rows.reverse().map((row) => ({ role: row.role, text: row.content, timestamp: row.createdAt }));
    }
}
