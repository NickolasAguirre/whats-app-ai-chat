import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessagesControllerController } from './whatsapp-message.controller.js';
import { WhatsappMessagesControllerService } from '../core/application/whats-app-message/whats-app-message.service.js';
import { YCloudWebhookSignatureGuard } from '../infrastructure/extern/whats-app/guards/ycloud-webhook-signature.guard.js';

describe('WhatsappMessagesControllerController', () => {
  let controller: WhatsappMessagesControllerController;
  const serviceMock = { handleIncomingMessage: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappMessagesControllerController],
      providers: [
        { provide: WhatsappMessagesControllerService, useValue: serviceMock },
      ],
    })
      .overrideGuard(YCloudWebhookSignatureGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WhatsappMessagesControllerController>(WhatsappMessagesControllerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('receiveMessage pasa el mensaje entrante al use-case', async () => {
    const event = {
      whatsappInboundMessage: {
        id: 'wamid.1', from: '+1555', to: '+1999', text: { body: 'hola' },
        customerProfile: { name: 'Nico' },
      },
    } as any;

    await controller.receiveMessage(event);

    expect(serviceMock.handleIncomingMessage).toHaveBeenCalledWith('+1555', '+1999', 'hola', 'Nico', 'wamid.1');
  });
});
