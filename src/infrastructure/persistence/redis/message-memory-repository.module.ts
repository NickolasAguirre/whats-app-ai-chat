import { Module } from '@nestjs/common';
import { RedisModule } from './redis.module.js';
import { MessageMemoryRedisRepository } from './message-memory-redis.repository.js';
import { MessageMemoryPort } from '../../../core/domain/ports/message-memory-port/message-memory.port.js';

@Module({
    imports: [RedisModule],
    providers: [
        MessageMemoryRedisRepository,
        { provide: MessageMemoryPort, useExisting: MessageMemoryRedisRepository },
    ],
    exports: [MessageMemoryPort],
})
export class MessageMemoryRepositoryModule {}
