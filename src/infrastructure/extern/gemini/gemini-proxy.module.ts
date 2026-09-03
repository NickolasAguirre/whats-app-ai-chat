import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { GeminiService } from './gemini-proxy.service.js';
import { AiMessageGeneratorPort } from '../../../core/domain/ports/ai-port/ai-message-generator.port.js';

@Module({
    imports: [HttpModule],
    providers: [
        {
            provide: GoogleGenAI,
            useFactory: (config: ConfigService) => new GoogleGenAI({ apiKey: config.get<string>('GEMINI_API_KEY') }),
            inject: [ConfigService],
        },
        GeminiService,
        { provide: AiMessageGeneratorPort, useExisting: GeminiService },
    ],
    exports: [AiMessageGeneratorPort],
})
export class GeminiModule {}
