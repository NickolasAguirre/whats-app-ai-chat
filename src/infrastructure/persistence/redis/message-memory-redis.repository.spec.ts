import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service.js';
import { MessageMemoryRedisRepository } from './message-memory-redis.repository.js';

describe('MessageMemoryRedisRepository', () => {
  let repository: MessageMemoryRedisRepository;
  const redisClientMock = {
    rpush: vi.fn(),
    ltrim: vi.fn(),
    expire: vi.fn(),
    lrange: vi.fn(),
  };
  const redisServiceMock = { getClient: () => redisClientMock };
  const configMock = { get: vi.fn().mockReturnValue('21600') };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageMemoryRedisRepository,
        { provide: RedisService, useValue: redisServiceMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    repository = module.get<MessageMemoryRedisRepository>(MessageMemoryRedisRepository);
  });

  it('appendMessage guarda el mensaje en la lista y renueva el TTL', async () => {
    const message = { role: 'inbound' as const, text: 'hola', timestamp: new Date('2026-09-14T00:00:00Z') };

    await repository.appendMessage('t1', 'p1', message);

    expect(redisClientMock.rpush).toHaveBeenCalledWith('conv:t1:p1', JSON.stringify(message));
    expect(redisClientMock.ltrim).toHaveBeenCalledWith('conv:t1:p1', -20, -1);
    expect(redisClientMock.expire).toHaveBeenCalledWith('conv:t1:p1', 21600);
  });

  it('getRecentMessages devuelve la lista de mensajes deserializados', async () => {
    const stored = [
      JSON.stringify({ role: 'inbound', text: 'hola', timestamp: '2026-09-14T00:00:00.000Z' }),
      JSON.stringify({ role: 'outbound', text: 'hola, en qué te ayudo?', timestamp: '2026-09-14T00:00:01.000Z' }),
    ];
    redisClientMock.lrange.mockResolvedValueOnce(stored);

    const result = await repository.getRecentMessages('t1', 'p1');

    expect(redisClientMock.lrange).toHaveBeenCalledWith('conv:t1:p1', 0, -1);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('hola');
    expect(result[0].role).toBe('inbound');
  });

  it('getRecentMessages reconstruye timestamp como Date (JSON.parse lo devuelve como string)', async () => {
    redisClientMock.lrange.mockResolvedValueOnce([
      JSON.stringify({ role: 'inbound', text: 'hola', timestamp: '2026-09-14T00:00:00.000Z' }),
    ]);

    const [message] = await repository.getRecentMessages('t1', 'p1');

    expect(message.timestamp).toBeInstanceOf(Date);
    expect(message.timestamp.toISOString()).toBe('2026-09-14T00:00:00.000Z');
  });

  it('getRecentMessages devuelve un array vacío si no hay historial', async () => {
    redisClientMock.lrange.mockResolvedValueOnce([]);

    const result = await repository.getRecentMessages('t1', 'p2');

    expect(result).toEqual([]);
  });
});
