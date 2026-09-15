import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai.service.js';
import { GEMINI_AI_PORT } from './gemini/gemini-proxy.module.js';
import { QWEN_AI_PORT } from './qwen/qwen.module.js';

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: GEMINI_AI_PORT, useValue: { generateMessage: vi.fn() } },
        { provide: QWEN_AI_PORT, useValue: { generateMessage: vi.fn() } },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
