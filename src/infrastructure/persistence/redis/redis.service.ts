import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly client: Redis;

    constructor(private readonly config: ConfigService) {
        // Por defecto ioredis reintenta 20 veces (~10 s) antes de fallar; con Redis caído eso demoraría la respuesta del webhook.
        this.client = new Redis(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379', {
            maxRetriesPerRequest: 1,
            commandTimeout: 2000,
        });
    }

    getClient(): Redis {
        return this.client;
    }

    async onModuleDestroy() {
        if (this.client.status === 'ready') {
            await this.client.quit();
            return;
        }

        this.client.disconnect();
    }
}
