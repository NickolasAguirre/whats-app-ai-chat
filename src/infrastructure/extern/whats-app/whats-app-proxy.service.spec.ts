import { of } from 'rxjs';
import { WhatsAppService } from './whats-app-proxy.service.js';

describe('WhatsAppService', () => {
  const httpMock = { post: vi.fn().mockReturnValue(of({})) };
  const configMock = { getOrThrow: vi.fn() };
  let service: WhatsAppService;

  beforeEach(() => {
    vi.clearAllMocks();
    httpMock.post.mockReturnValue(of({}));
    service = new WhatsAppService(httpMock as never, configMock as never);
  });

  it('sendMessage manda la API_KEY_YCLOUD en el header', async () => {
    configMock.getOrThrow.mockReturnValueOnce('la-api-key');

    const message = { from: '+1999', to: '+1555', type: 'text', text: { body: 'hola' } } as any;
    await service.sendMessage(message);

    expect(configMock.getOrThrow).toHaveBeenCalledWith('API_KEY_YCLOUD');
    expect(httpMock.post).toHaveBeenCalledWith(
      expect.any(String),
      message,
      { headers: expect.objectContaining({ 'X-API-Key': 'la-api-key' }) },
    );
  });
});
