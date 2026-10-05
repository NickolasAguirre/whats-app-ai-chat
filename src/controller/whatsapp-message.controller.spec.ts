import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessagesControllerController } from './whatsapp-message.controller.js';
import { WhatsappMessagesControllerService } from '../core/use-case/whats-app-message/whats-app-message.service.js';
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

  it('receiveMessage pasa el tenantId resuelto por el guard al use-case', async () => {
    const event = {
      whatsappInboundMessage: {
        from: '+1555', to: '+1999', text: { body: 'hola' },
        customerProfile: { name: 'Nico' },
      },
    } as any;
    const request = { whatsAppNumber: { tenantId: 't1' } } as any;

    await controller.receiveMessage(event, request);

    expect(serviceMock.handleIncomingMessage).toHaveBeenCalledWith('t1', '+1555', '+1999', 'hola', 'Nico');
  });
});
