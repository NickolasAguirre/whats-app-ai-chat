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
});
