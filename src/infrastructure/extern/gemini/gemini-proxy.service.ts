import { GoogleGenAI } from '@google/genai';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { AiMessageGeneratorPort } from '../../../core/domain/ports/ai-port/ai-message-generator.port.js';

@Injectable()
export class GeminiService implements AiMessageGeneratorPort {
    constructor(private ai_gemini: GoogleGenAI, private httpService: HttpService) {}
    geminiModel = "gemini-3.5-flash-lite";

    async generate(message: string): Promise<string> {
        const answer = await this.ai_gemini.interactions.create({ model: this.geminiModel, input: message });
        return answer.output_text ?? '';
    }
}
