import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessagesControllerController } from './whatsapp-message.controller.js';
import { WhatsappMessagesControllerService } from '../core/use-case/whats-app-message/whats-app-message.service.js';
import { AiMessageGeneratorPort } from '../core/domain/ports/ai-port/ai-message-generator.port.js';
import { WhatsAppPort } from '../core/domain/ports/whats-app-port/whats-app.port.js';

describe('WhatsappMessagesControllerController', () => {
  let controller: WhatsappMessagesControllerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappMessagesControllerController],
      providers: [
        WhatsappMessagesControllerService,
        { provide: AiMessageGeneratorPort, useValue: { generate: vi.fn() } },
        { provide: WhatsAppPort, useValue: { sendMessage: vi.fn() } },
      ],
    }).compile();

    controller = module.get<WhatsappMessagesControllerController>(WhatsappMessagesControllerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
