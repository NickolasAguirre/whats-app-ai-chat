import { Test, TestingModule } from '@nestjs/testing';
import { GoogleGenAI } from '@google/genai';
import { HttpService } from '@nestjs/axios';
import { GeminiService } from './gemini-proxy.service.js';

describe('GeminiService', () => {
  let service: GeminiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiService,
        { provide: GoogleGenAI, useValue: {} },
        { provide: HttpService, useValue: {} },
      ],
    }).compile();

    service = module.get<GeminiService>(GeminiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('generateMessage manda las instructions como system_instruction y el mensaje como input', async () => {
    const createMock = vi.fn().mockResolvedValueOnce({ output_text: 'ok' });
    (service as any).ai_gemini = { interactions: { create: createMock } };

    const result = await service.generateMessage('hola', { instructions: 'sé formal' });

    expect(result).toBe('ok');
    expect(createMock).toHaveBeenCalledWith({
      model: service.geminiModel,
      input: 'hola',
      system_instruction: 'sé formal',
    });
  });

  it('generateMessage incluye el historial como transcripción antes del mensaje actual', async () => {
    const createMock = vi.fn().mockResolvedValueOnce({ output_text: 'ok' });
    (service as any).ai_gemini = { interactions: { create: createMock } };
    const history = [
      { role: 'inbound' as const, text: 'hola', timestamp: new Date() },
      { role: 'outbound' as const, text: 'hola, en qué te ayudo?', timestamp: new Date() },
    ];

    await service.generateMessage('quiero un turno', { history });

    expect(createMock).toHaveBeenCalledWith({
      model: service.geminiModel,
      input: 'Conversación previa:\nUsuario: hola\nAsistente: hola, en qué te ayudo?\n\nMensaje actual del usuario: quiero un turno',
      system_instruction: undefined,
    });
  });
});
