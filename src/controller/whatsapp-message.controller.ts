import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { WhatsappMessagesControllerService } from '../core/use-case/whats-app-message/whats-app-message.service.js';
import { YCloudInboundMessageEvent } from '../infrastructure/extern/whats-app/dto/ycloud-inbound-message-event.dto.js';
import { YCloudWebhookSignatureGuard } from '../infrastructure/extern/whats-app/guards/ycloud-webhook-signature.guard.js';
import { WhatsAppNumber } from '../core/domain/entities/whats-app-number.entity.js';

interface RequestWithWhatsAppNumber extends Request {
    whatsAppNumber?: WhatsAppNumber;
}

@Controller('whatsapp/webhook')
export class WhatsappMessagesControllerController {
  constructor(private readonly whatsappMessagesControllerService: WhatsappMessagesControllerService) {}

  @Post()
  @UseGuards(YCloudWebhookSignatureGuard)
  async receiveMessage(@Body() event: YCloudInboundMessageEvent, @Req() request: RequestWithWhatsAppNumber) {
    const { from, to, text, customerProfile } = event.whatsappInboundMessage;
    const tenantId = request.whatsAppNumber!.tenantId;

    await this.whatsappMessagesControllerService.handleIncomingMessage(
      tenantId,
      from,
      to,
      text.body,
      customerProfile?.name,
    );
  }
}
