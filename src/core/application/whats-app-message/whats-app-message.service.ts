import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiPort } from '../../domain/ports/ai-port/ai.port.js';
import { WhatsAppPort } from '../../domain/ports/whats-app-port/whats-app.port.js';
import { PersonRepositoryPort } from '../../domain/ports/person-port/person.port.js';
import { InstructionsService } from '../instructions/instructions.service.js';
import { KnowledgePort } from '../../domain/ports/knowledge-port/knowledge.port.js';
import { MessageMemoryPort } from '../../domain/ports/message-memory-port/message-memory.port.js';
import { MessageHistoryPort } from '../../domain/ports/message-history-port/message-history.port.js';
import { ConversationMessage } from '../../domain/entities/conversation-message.entity.js';
import { WhatsAppMessageBuilder } from '../../domain/entities/whats-app-message.entity.js';

/** Cuántos mensajes recientes se rehidratan desde la BD cuando Redis no tiene el contexto (igual que el límite de Redis). */
const HISTORY_CONTEXT_LIMIT = 20;

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
        @Inject(MessageHistoryPort) private readonly messageHistory: MessageHistoryPort,
    ) {}

    async handleIncomingMessage(
        from: string,
        to: string,
        text: string,
        personName?: string,
        providerMessageId?: string,
    ): Promise<void> {
        const person = await this.personRepository.findOrCreate(from, personName);
        const now = new Date();

        const inbound = await this.saveInboundSafely(person.id, text, providerMessageId, now);
        if (inbound.duplicate) {
            this.logger.log(`Mensaje ${providerMessageId} ya procesado; se ignora el reenvío del webhook`);
            return;
        }

        try {
            const instructions = await this.instructionsService.getEffective();
            const history = await this.getContextSafely(person.id, inbound.id);
            const knowledge = await this.searchKnowledgeSafely(text);

            const replyText = await this.aiMessageGenerator.generateMessage(text, {
                instructions: instructions.content,
                knowledge,
                history,
            });

            const reply = new WhatsAppMessageBuilder()
                .setFromNumber(to)
                .setToNumber(from)
                .setType("text")
                .setText(replyText)
                .build();

            await this.whatsAppService.sendMessage(reply);

            // Se persiste después de enviar: si algo falló antes, el reintento del webhook parte de cero sin mensajes a medias.
            await this.appendMessageSafely(person.id, { role: 'inbound', text, timestamp: now });
            await this.appendMessageSafely(person.id, { role: 'outbound', text: replyText, timestamp: new Date() });
            await this.saveOutboundSafely(person.id, replyText);
        } catch (error) {
            // El mensaje quedó sin respuesta: se libera su id para que el reintento de YCloud no se tome por duplicado.
            await this.discardInboundSafely(inbound.id);
            throw error;
        }
    }

    /** Guarda el entrante en la BD. Solo es duplicado cuando la BD confirma que ya existía; ante un fallo se sigue adelante. */
    private async saveInboundSafely(
        personId: string,
        text: string,
        providerMessageId: string | undefined,
        createdAt: Date,
    ): Promise<{ duplicate: boolean; id?: string }> {
        try {
            const id = await this.messageHistory.save({ personId, role: 'inbound', content: text, providerMessageId, createdAt });
            return id === null ? { duplicate: true } : { duplicate: false, id };
        } catch (error) {
            this.logger.warn(`No se pudo guardar el mensaje entrante en el historial (person=${personId}): ${error}`);
            return { duplicate: false };
        }
    }

    private async discardInboundSafely(id: string | undefined): Promise<void> {
        if (!id) return;
        try {
            await this.messageHistory.discard(id);
        } catch (error) {
            this.logger.warn(`No se pudo liberar el mensaje entrante ${id} tras un fallo: ${error}`);
        }
    }

    private async saveOutboundSafely(personId: string, text: string): Promise<void> {
        try {
            await this.messageHistory.save({ personId, role: 'outbound', content: text, createdAt: new Date() });
        } catch (error) {
            this.logger.warn(`No se pudo guardar la respuesta en el historial (person=${personId}): ${error}`);
        }
    }

    private async searchKnowledgeSafely(text: string): Promise<string[]> {
        try {
            return await this.knowledge.search(text);
        } catch (error) {
            this.logger.warn(`No se pudo consultar el conocimiento; se responde sin él: ${error}`);
            return [];
        }
    }

    /** Contexto para el LLM: lo reciente en Redis; si no hay, se reconstruye desde la BD y se vuelve a sembrar en Redis. */
    private async getContextSafely(personId: string, currentMessageId?: string): Promise<ConversationMessage[]> {
        const fromMemory = await this.getRecentMessagesSafely(personId);
        if (fromMemory && fromMemory.length > 0) {
            return fromMemory;
        }

        try {
            const fromHistory = await this.messageHistory.findRecent(personId, HISTORY_CONTEXT_LIMIT, currentMessageId);
            if (fromMemory) {
                // Redis respondió vacío (expiró): se siembra para que el siguiente mensaje no pierda el contexto.
                for (const message of fromHistory) {
                    await this.appendMessageSafely(personId, message);
                }
            }
            return fromHistory;
        } catch (error) {
            this.logger.warn(`No se pudo leer el historial (person=${personId}): ${error}`);
            return [];
        }
    }

    /** `null` cuando Redis falla (distinto de "vacío"). */
    private async getRecentMessagesSafely(personId: string): Promise<ConversationMessage[] | null> {
        try {
            return await this.messageMemory.getRecentMessages(personId);
        } catch (error) {
            this.logger.warn(`No se pudo leer la memoria conversacional (person=${personId}): ${error}`);
            return null;
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
