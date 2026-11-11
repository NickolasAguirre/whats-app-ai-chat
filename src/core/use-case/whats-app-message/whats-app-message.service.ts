import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiPort } from '../../domain/ports/ai-port/ai.port.js';
import { WhatsAppPort } from '../../domain/ports/whats-app-port/whats-app.port.js';
import { PersonRepositoryPort } from '../../domain/ports/person-port/person.port.js';
import { InstructionsService } from '../instructions/instructions.service.js';
import { KnowledgePort } from '../../domain/ports/knowledge-port/knowledge.port.js';
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
        @Inject(InstructionsService) private readonly instructionsService: InstructionsService,
        @Inject(KnowledgePort) private readonly knowledge: KnowledgePort,
        @Inject(MessageMemoryPort) private readonly messageMemory: MessageMemoryPort,
    ) {}

    async handleIncomingMessage(from: string, to: string, text: string, personName?: string): Promise<void> {
        const person = await this.personRepository.findOrCreate(from, personName);
        const instructions = await this.instructionsService.getEffective();
        const history = await this.getRecentMessagesSafely(person.id);
        const knowledge = await this.searchKnowledgeSafely(text);

        const replyText = await this.aiMessageGenerator.generateMessage(text, {
            instructions: instructions.content,
            knowledge,
            history,
        });

        const now = new Date();
        await this.appendMessageSafely(person.id, { role: 'inbound', text, timestamp: now });
        await this.appendMessageSafely(person.id, { role: 'outbound', text: replyText, timestamp: now });

        const reply = new WhatsAppMessageBuilder()
            .setFromNumber(to)
            .setToNumber(from)
            .setType("text")
            .setText(replyText)
            .build();

        await this.whatsAppService.sendMessage(reply);
    }

    private async searchKnowledgeSafely(text: string): Promise<string[]> {
        try {
            return await this.knowledge.search(text);
        } catch (error) {
            this.logger.warn(`No se pudo consultar el conocimiento; se responde sin él: ${error}`);
            return [];
        }
    }

    private async getRecentMessagesSafely(personId: string): Promise<ConversationMessage[]> {
        try {
            return await this.messageMemory.getRecentMessages(personId);
        } catch (error) {
            this.logger.warn(`No se pudo leer la memoria conversacional (person=${personId}): ${error}`);
            return [];
        }
    }

    private async appendMessageSafely(personId: string, message: ConversationMessage): Promise<void> {
        try {
            await this.messageMemory.appendMessage(personId, message);
        } catch (error) {
            this.logger.warn(`No se pudo guardar el mensaje en memoria (person=${personId}): ${error}`);
        }
    }
}
