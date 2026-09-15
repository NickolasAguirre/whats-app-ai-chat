import { Module } from '@nestjs/common';
import { QwenService } from './qwen.service.js';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { HttpModule } from '@nestjs/axios';

export const QWEN_AI_PORT = "QWEN_AI_PORT"

@Module({
    imports: [HttpModule],
    providers: [
        {
            provide: OpenAI,
            inject: [ConfigService],
            useFactory: (config: ConfigService) => new OpenAI({ apiKey: config.get<string>('QWEN_API_KEY') , baseURL: config.get<string>('QWEN_URL_BASE_OPEN_AI')}),
        },
        QwenService,
        { provide: QWEN_AI_PORT, useExisting: QwenService }
    ],
    exports: [QWEN_AI_PORT]
})
export class QwenModule {}
