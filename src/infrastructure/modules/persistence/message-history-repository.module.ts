import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageHistoryRepository } from '../../persistence/repositories/message-history.repository.js';
import { MessageHistoryPort } from '../../../core/domain/ports/message-history-port/message-history.port.js';
import { MessageSchema } from '../../persistence/schemas/message.schema.js';

@Module({
    imports: [TypeOrmModule.forFeature([MessageSchema])],
    providers: [
        MessageHistoryRepository,
        { provide: MessageHistoryPort, useExisting: MessageHistoryRepository },
    ],
    exports: [MessageHistoryPort],
})
export class MessageHistoryRepositoryModule {}
