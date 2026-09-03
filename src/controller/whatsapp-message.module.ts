import { Module } from '@nestjs/common';
import { WhatsappMessagesControllerService } from '../core/use-case/whats-app-message/whats-app-message.service.js';
import { WhatsappMessagesControllerController } from './whatsapp-message.controller.js';
import { GeminiModule } from '../infrastructure/extern/gemini/gemini-proxy.module.js';
import { WhatsAppModule } from '../infrastructure/extern/whats-app/whats-app-proxy.module.js';

@Module({
  imports: [GeminiModule, WhatsAppModule],
  controllers: [WhatsappMessagesControllerController],
  providers: [WhatsappMessagesControllerService],
})
export class WhatsappMessagesControllerModule {}
