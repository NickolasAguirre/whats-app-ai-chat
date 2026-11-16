import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { ConfigModule } from '@nestjs/config';
import { WhatsappMessagesControllerModule } from './infrastructure/modules/whatsapp-message/whatsapp-message.module.js';
import { WhatsAppModule } from './infrastructure/modules/whats-app/whats-app-proxy.module.js';
import { AiModule } from './infrastructure/modules/ai/ai.module.js';
import { RedisModule } from './infrastructure/modules/persistence/redis.module.js';
import { AdminModule } from './infrastructure/modules/admin/admin.module.js';
import { RagModule } from './infrastructure/modules/rag/rag.module.js';
import { DatabaseModule } from './infrastructure/modules/persistence/database.module.js';
import { AuthModule } from './infrastructure/modules/auth/auth.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ObserveModule.forRoot({
      appKey: process.env.APP_KEY_NEST_LOGGER ?? "",
      appSecret: process.env.APP_SECRET_NEST_LOGGER ?? "",
      serviceId: 'whats-app-ai-chat',
    }),
    WhatsappMessagesControllerModule,
    WhatsAppModule,
    AiModule,
    DatabaseModule,
    RedisModule,
    RagModule,
    AdminModule,
    AuthModule,
  ],
})
export class AppModule {}
