import { GoogleGenAI } from '@google/genai';
import { Injectable } from '@nestjs/common';
import { AiSelectedPort } from '../ports/ai-selected.port.js';

@Injectable()
export class GeminiService implements AiSelectedPort {
    constructor(private ai_gemini: GoogleGenAI,) {}
    geminiModel = "gemini-3.5-flash-lite";
    async generateMessage(message: string): Promise<string> {
        const answer = await this.ai_gemini.interactions.create({ model: this.geminiModel, input: message });
        return answer.output_text ?? '';
    }
}
