import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessagesControllerService } from './whats-app-message.service.js';
import { AiMessageGeneratorPort } from '../../domain/ports/ai-port/ai-message-generator.port.js';
import { WhatsAppPort } from '../../domain/ports/whats-app-port/whats-app.port.js';

describe('WhatsappMessagesControllerService', () => {
  let service: WhatsappMessagesControllerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappMessagesControllerService,
        { provide: AiMessageGeneratorPort, useValue: { generate: vi.fn() } },
        { provide: WhatsAppPort, useValue: { sendMessage: vi.fn() } },
      ],
    }).compile();

    service = module.get<WhatsappMessagesControllerService>(WhatsappMessagesControllerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
