import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service.js';

describe('RedisService', () => {
  let service: RedisService;
  const configMock = { get: vi.fn().mockReturnValue('redis://localhost:6379') };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    service.getClient().disconnect();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('expone un cliente ioredis construido con REDIS_URL', () => {
    expect(service.getClient()).toBeDefined();
    expect(configMock.get).toHaveBeenCalledWith('REDIS_URL');
  });

  it('falla rápido si Redis está caído, para que el use-case degrade a "sin memoria"', () => {
    const { options } = service.getClient();

    expect(options.maxRetriesPerRequest).toBe(1);
    expect(options.commandTimeout).toBe(2000);
  });
});
