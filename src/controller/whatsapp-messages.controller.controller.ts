import { Controller, Get, Post } from '@nestjs/common';
import { WhatsappMessagesControllerService } from '../core/use-case/whatsapp-messages.controller.service.js';

@Controller('whatsapp-messages.controller')
export class WhatsappMessagesControllerController {
  constructor(private readonly whatsappMessagesControllerService: WhatsappMessagesControllerService) {}

  @Post("/")
  GetMessage(){
    this.whatsappMessagesControllerService
  }
}
