import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service.js';
import { GEMINI_AI_PORT } from './gemini/gemini-proxy.module.js';
import { QWEN_AI_PORT } from './qwen/qwen.module.js';

describe('AiService', () => {
  let service: AiService;
  const geminiMock = { generateMessage: vi.fn() };
  const qwenMock = { generateMessage: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: GEMINI_AI_PORT, useValue: geminiMock },
        { provide: QWEN_AI_PORT, useValue: qwenMock },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('generateMessage reenvía instructions e history al proveedor elegido', async () => {
    qwenMock.generateMessage.mockResolvedValueOnce('respuesta');
    const history = [{ role: 'inbound' as const, text: 'hola', timestamp: new Date() }];

    const result = await service.generateMessage('mensaje', { instructions: 'sé breve', history });

    expect(result).toBe('respuesta');
    expect(qwenMock.generateMessage).toHaveBeenCalledWith('mensaje', { instructions: 'sé breve', history });
  });
});
