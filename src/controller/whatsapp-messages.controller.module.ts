import { Module } from '@nestjs/common';
import { WhatsappMessagesControllerService } from '../core/use-case/whatsapp-messages.controller.service.js';
import { WhatsappMessagesControllerController } from './whatsapp-messages.controller.controller.js';

@Module({
  controllers: [WhatsappMessagesControllerController],
  providers: [WhatsappMessagesControllerService],
})
export class WhatsappMessagesControllerModule {}
