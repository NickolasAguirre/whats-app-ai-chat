import { ConversationMessage } from '../../entities/conversation-message.entity.js';

export abstract class MessageMemoryPort {
    abstract getRecentMessages(tenantId: string, personId: string): Promise<ConversationMessage[]>;
    abstract appendMessage(tenantId: string, personId: string, message: ConversationMessage): Promise<void>;
}
