import { Test, TestingModule } from '@nestjs/testing';
import { CollentionService } from './collention.service.js';

describe('CollentionService', () => {
  let service: CollentionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CollentionService],
    }).compile();

    service = module.get<CollentionService>(CollentionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
