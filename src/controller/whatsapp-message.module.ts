import { Module } from '@nestjs/common';
import { WhatsappMessagesControllerService } from '../core/use-case/whats-app-message/whats-app-message.service.js';
import { WhatsappMessagesControllerController } from './whatsapp-message.controller.js';
import { AiModule } from '../infrastructure/extern/ai/ai.module.js';
import { WhatsAppModule } from '../infrastructure/extern/whats-app/whats-app-proxy.module.js';

@Module({
  imports: [AiModule, WhatsAppModule],
  controllers: [WhatsappMessagesControllerController],
  providers: [WhatsappMessagesControllerService],
})
export class WhatsappMessagesControllerModule {}
