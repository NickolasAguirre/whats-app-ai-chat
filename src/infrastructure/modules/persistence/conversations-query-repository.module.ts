import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationsQueryRepository } from '../../persistence/repositories/conversations-query.repository.js';
import { ConversationsQueryPort } from '../../../core/domain/ports/conversations-query-port/conversations-query.port.js';
import { MessageSchema } from '../../persistence/schemas/message.schema.js';
import { PersonSchema } from '../../persistence/schemas/person.schema.js';

@Module({
    imports: [TypeOrmModule.forFeature([PersonSchema, MessageSchema])],
    providers: [
        ConversationsQueryRepository,
        { provide: ConversationsQueryPort, useExisting: ConversationsQueryRepository },
    ],
    exports: [ConversationsQueryPort],
})
export class ConversationsQueryRepositoryModule {}
