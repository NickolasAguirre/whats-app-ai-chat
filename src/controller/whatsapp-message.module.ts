import { Module } from '@nestjs/common';
import { WhatsappMessagesControllerService } from '../core/use-case/whats-app-message/whats-app-message.service.js';
import { WhatsappMessagesControllerController } from './whatsapp-message.controller.js';
import { AiModule } from '../infrastructure/extern/ai/ai.module.js';
import { WhatsAppModule } from '../infrastructure/extern/whats-app/whats-app-proxy.module.js';
import { PersonRepositoryModule } from '../infrastructure/persistence/person-repository.module.js';
import { InstructionsModule } from './instructions.module.js';
import { RagModule } from '../infrastructure/extern/rag/rag.module.js';
import { MessageMemoryRepositoryModule } from '../infrastructure/persistence/redis/message-memory-repository.module.js';

@Module({
  imports: [AiModule, WhatsAppModule, PersonRepositoryModule, InstructionsModule, RagModule, MessageMemoryRepositoryModule],
  controllers: [WhatsappMessagesControllerController],
  providers: [WhatsappMessagesControllerService],
})
export class WhatsappMessagesControllerModule {}
