import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { WhatsappMessagesControllerService } from '../core/application/whats-app-message/whats-app-message.service.js';
import { YCloudInboundMessageEvent } from '../infrastructure/extern/whats-app/dto/ycloud-inbound-message-event.dto.js';
import { YCloudWebhookSignatureGuard } from '../infrastructure/extern/whats-app/guards/ycloud-webhook-signature.guard.js';


@Controller('whatsapp/webhook')
export class WhatsappMessagesControllerController {
  constructor(private readonly whatsappMessagesControllerService: WhatsappMessagesControllerService) {}

  // Público para el JWT global: YCloud no manda Bearer; la firma HMAC la valida el guard.
  @Public()
  @Post()
  @UseGuards(YCloudWebhookSignatureGuard)
  async receiveMessage(@Body() event: YCloudInboundMessageEvent) {
    const { id, from, to, text, customerProfile } = event.whatsappInboundMessage;

    await this.whatsappMessagesControllerService.handleIncomingMessage(
      from,
      to,
      text.body,
      customerProfile?.name,
      id,
    );
  }
}
