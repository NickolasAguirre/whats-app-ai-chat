import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiPort } from '../../domain/ports/ai-port/ai.port.js';
import { WhatsAppPort } from '../../domain/ports/whats-app-port/whats-app.port.js';
import { PersonRepositoryPort } from '../../domain/ports/person-port/person.port.js';
import { InstructionsRepositoryPort } from '../../domain/ports/instructions-port/instructions.port.js';
import { MessageMemoryPort } from '../../domain/ports/message-memory-port/message-memory.port.js';
import { ConversationMessage } from '../../domain/entities/conversation-message.entity.js';
import { WhatsAppMessageBuilder } from '../../domain/entities/whats-app-message.entity.js';

@Injectable()
export class WhatsappMessagesControllerService {
    private readonly logger = new Logger(WhatsappMessagesControllerService.name);

    constructor(
        @Inject(AiPort) private readonly aiMessageGenerator: AiPort,
        @Inject(WhatsAppPort) private readonly whatsAppService: WhatsAppPort,
        @Inject(PersonRepositoryPort) private readonly personRepository: PersonRepositoryPort,
        @Inject(InstructionsRepositoryPort) private readonly instructionsRepository: InstructionsRepositoryPort,
        @Inject(MessageMemoryPort) private readonly messageMemory: MessageMemoryPort,
    ) {}

    async handleIncomingMessage(tenantId: string, from: string, to: string, text: string, personName?: string): Promise<void> {
        const person = await this.personRepository.findOrCreate(tenantId, from, personName);
        const instructions = await this.instructionsRepository.getForTenant(tenantId);
        const history = await this.getRecentMessagesSafely(tenantId, person.id);

        const replyText = await this.aiMessageGenerator.generateMessage(text, {
            instructions: instructions?.content,
            history,
        });

        const now = new Date();
        await this.appendMessageSafely(tenantId, person.id, { role: 'inbound', text, timestamp: now });
        await this.appendMessageSafely(tenantId, person.id, { role: 'outbound', text: replyText, timestamp: now });

        const reply = new WhatsAppMessageBuilder()
            .setFromNumber(to)
            .setToNumber(from)
            .setType("text")
            .setText(replyText)
            .build();

        await this.whatsAppService.sendMessage(reply);
    }

    private async getRecentMessagesSafely(tenantId: string, personId: string): Promise<ConversationMessage[]> {
        try {
            return await this.messageMemory.getRecentMessages(tenantId, personId);
        } catch (error) {
            this.logger.warn(`No se pudo leer la memoria conversacional (tenant=${tenantId}, person=${personId}): ${error}`);
            return [];
        }
    }

    private async appendMessageSafely(tenantId: string, personId: string, message: ConversationMessage): Promise<void> {
        try {
            await this.messageMemory.appendMessage(tenantId, personId, message);
        } catch (error) {
            this.logger.warn(`No se pudo guardar el mensaje en memoria (tenant=${tenantId}, person=${personId}): ${error}`);
        }
    }
}
