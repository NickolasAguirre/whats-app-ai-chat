import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { WhatsappMessagesControllerService } from '../core/use-case/whats-app-message/whats-app-message.service.js';
import { YCloudInboundMessageEvent } from '../infrastructure/extern/whats-app/dto/ycloud-inbound-message-event.dto.js';
import { YCloudWebhookSignatureGuard } from '../infrastructure/extern/whats-app/guards/ycloud-webhook-signature.guard.js';

@Controller('whatsapp/webhook')
export class WhatsappMessagesControllerController {
  constructor(private readonly whatsappMessagesControllerService: WhatsappMessagesControllerService) {}

  @Post()
  @UseGuards(YCloudWebhookSignatureGuard)
  async receiveMessage(@Body() event: YCloudInboundMessageEvent) {
    const { from, to, text } = event.whatsappInboundMessage;
    await this.whatsappMessagesControllerService.handleIncomingMessage(from, to, text.body);
  }
}
