import { ConversationMessage } from '../../entities/conversation-message.entity.js';

export interface AiGenerateOptions {
    instructions?: string;
    history?: ConversationMessage[];
}

export abstract class AiPort {
    abstract generateMessage(message: string, options?: AiGenerateOptions): Promise<string>;
}
