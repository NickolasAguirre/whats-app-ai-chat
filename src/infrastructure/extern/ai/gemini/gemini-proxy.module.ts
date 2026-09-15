import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { GeminiService } from './gemini-proxy.service.js';

export const GEMINI_AI_PORT = "GEMINI_AI_PORT"

@Module({
    imports: [HttpModule],
    providers: [
        {
            provide: GoogleGenAI,
            inject: [ConfigService],
            useFactory: (config: ConfigService) => new GoogleGenAI({ apiKey: config.get<string>('GEMINI_API_KEY') }),
        },
        GeminiService,
        { provide: GEMINI_AI_PORT, useExisting: GeminiService }
    ],
    exports: [GEMINI_AI_PORT]
})
export class GeminiModule {}
