import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service.js';
import { MessageMemoryPort } from '../../../core/domain/ports/message-memory-port/message-memory.port.js';
import { ConversationMessage } from '../../../core/domain/entities/conversation-message.entity.js';

const MAX_MESSAGES_PER_CONVERSATION = 20;

@Injectable()
export class MessageMemoryRedisRepository implements MessageMemoryPort {
    constructor(
        private readonly redis: RedisService,
        private readonly config: ConfigService,
    ) {}

    private key(tenantId: string, personId: string): string {
        return `conv:${tenantId}:${personId}`;
    }

    async appendMessage(tenantId: string, personId: string, message: ConversationMessage): Promise<void> {
        const key = this.key(tenantId, personId);
        const ttlSeconds = Number(this.config.get<string>('MESSAGE_MEMORY_TTL_SECONDS') ?? '21600');
        const client = this.redis.getClient();

        await client.rpush(key, JSON.stringify(message));
        await client.ltrim(key, -MAX_MESSAGES_PER_CONVERSATION, -1);
        await client.expire(key, ttlSeconds);
    }

    async getRecentMessages(tenantId: string, personId: string): Promise<ConversationMessage[]> {
        const key = this.key(tenantId, personId);
        const raw = await this.redis.getClient().lrange(key, 0, -1);

        return raw.map((entry) => {
            const parsed = JSON.parse(entry) as Omit<ConversationMessage, 'timestamp'> & { timestamp: string };
            return { ...parsed, timestamp: new Date(parsed.timestamp) };
        });
    }
}
