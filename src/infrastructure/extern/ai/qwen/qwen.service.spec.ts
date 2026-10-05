import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { QwenService } from './qwen.service.js';

describe('QwenService', () => {
  let service: QwenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QwenService,
        { provide: OpenAI, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    service = module.get<QwenService>(QwenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('generateMessage manda las instructions en el parámetro instructions y el mensaje como input', async () => {
    const createMock = vi.fn().mockResolvedValueOnce({ output_text: 'ok' });
    (service as any).open_ai = { responses: { create: createMock } };

    const result = await service.generateMessage('hola', { instructions: 'sé formal' });

    expect(result).toBe('ok');
    expect(createMock).toHaveBeenCalledWith({
      model: service.model,
      instructions: 'sé formal',
      input: [{ role: 'user', content: 'hola' }],
    });
  });

  it('generateMessage mapea el historial a mensajes user/assistant antes del mensaje actual', async () => {
    const createMock = vi.fn().mockResolvedValueOnce({ output_text: 'ok' });
    (service as any).open_ai = { responses: { create: createMock } };
    const history = [
      { role: 'inbound' as const, text: 'hola', timestamp: new Date() },
      { role: 'outbound' as const, text: 'hola, en qué te ayudo?', timestamp: new Date() },
    ];

    await service.generateMessage('quiero un turno', { history });

    expect(createMock).toHaveBeenCalledWith({
      model: service.model,
      instructions: undefined,
      input: [
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: 'hola, en qué te ayudo?' },
        { role: 'user', content: 'quiero un turno' },
      ],
    });
  });

  it('generateMessage propaga el error del proveedor en vez de devolver un string vacío', async () => {
    (service as any).open_ai = { responses: { create: vi.fn().mockRejectedValueOnce(new Error('provider down')) } };

    await expect(service.generateMessage('hola')).rejects.toThrow('provider down');
  });
});
