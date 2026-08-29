import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { ConfigModule } from '@nestjs/config';
import { WhatsappMessagesControllerModule } from './controller/whatsapp-messages.controller.module.js';
import { GeminiModule } from './infrastructure/extern/gemini/gemini.module.js';
import { GeminiService } from './infrastructure/extern/gemini/gemini.service.js';

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
    GeminiModule,
  ],
  providers: [],

})
export class AppModule {}
