import { Inject, Injectable } from '@nestjs/common';
import { AiMessageGeneratorPort } from '../../domain/ports/ai-port/ai-message-generator.port.js';
import { WhatsAppPort } from '../../domain/ports/whats-app-port/whats-app.port.js';
import { WhatsAppMessageBuilder } from '../../domain/entities/whats-app-message.entity.js';

@Injectable()
export class WhatsappMessagesControllerService {
    constructor(
        @Inject(AiMessageGeneratorPort) private readonly aiMessageGenerator: AiMessageGeneratorPort,
        @Inject(WhatsAppPort) private readonly whatsAppService: WhatsAppPort,
    ) {}

    async handleIncomingMessage(from: string, to: string, text: string): Promise<void> {
        const replyText = await this.aiMessageGenerator.generate(text);

        const reply = new WhatsAppMessageBuilder()
            .setFromNumber(to)
            .setToNumber(from)
            .setType("text")
            .setText(replyText)
            .build();

        await this.whatsAppService.sendMessage(reply);
    }
}
