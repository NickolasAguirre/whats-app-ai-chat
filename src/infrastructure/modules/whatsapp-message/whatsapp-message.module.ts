import { Module } from '@nestjs/common';
import { WhatsappMessagesControllerService } from '../../../core/application/whats-app-message/whats-app-message.service.js';
import { WhatsappMessagesControllerController } from '../../../controller/whatsapp-message.controller.js';
import { AiModule } from '../ai/ai.module.js';
import { WhatsAppModule } from '../whats-app/whats-app-proxy.module.js';
import { PersonRepositoryModule } from '../persistence/person-repository.module.js';
import { InstructionsModule } from '../instructions/instructions.module.js';
import { RagModule } from '../rag/rag.module.js';
import { MessageMemoryRepositoryModule } from '../persistence/message-memory-repository.module.js';
import { MessageHistoryRepositoryModule } from '../persistence/message-history-repository.module.js';

@Module({
  imports: [AiModule, WhatsAppModule, PersonRepositoryModule, InstructionsModule, RagModule, MessageMemoryRepositoryModule, MessageHistoryRepositoryModule],
  controllers: [WhatsappMessagesControllerController],
  providers: [WhatsappMessagesControllerService],
})
export class WhatsappMessagesControllerModule {}
