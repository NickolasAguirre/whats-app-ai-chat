import { WhatsAppMessage } from '../../entities/whats-app-message.entity.js';

export abstract class WhatsAppPort {
    abstract sendMessage(message: WhatsAppMessage): Promise<void>;
}
