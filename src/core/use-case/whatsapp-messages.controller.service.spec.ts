import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessagesControllerService } from './whatsapp-messages.controller.service.js';

describe('WhatsappMessagesControllerService', () => {
  let service: WhatsappMessagesControllerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappMessagesControllerService],
    }).compile();

    service = module.get<WhatsappMessagesControllerService>(WhatsappMessagesControllerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
