import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessagesControllerController } from './whatsapp-messages.controller.controller.js';
import { WhatsappMessagesControllerService } from '../core/use-case/whatsapp-messages.controller.service.js';

describe('WhatsappMessagesControllerController', () => {
  let controller: WhatsappMessagesControllerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappMessagesControllerController],
      providers: [WhatsappMessagesControllerService],
    }).compile();

    controller = module.get<WhatsappMessagesControllerController>(WhatsappMessagesControllerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
