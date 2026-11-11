import { ConversationMessage } from '../../entities/conversation-message.entity.js';

export abstract class MessageMemoryPort {
    abstract getRecentMessages(personId: string): Promise<ConversationMessage[]>;
    abstract appendMessage(personId: string, message: ConversationMessage): Promise<void>;
}
