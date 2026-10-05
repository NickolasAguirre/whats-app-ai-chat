import { GoogleGenAI } from '@google/genai';
import { Injectable } from '@nestjs/common';
import { AiSelectedPort } from '../ports/ai-selected.port.js';
import { AiGenerateOptions } from '../../../../core/domain/ports/ai-port/ai.port.js';
import { ConversationMessage } from '../../../../core/domain/entities/conversation-message.entity.js';

@Injectable()
export class GeminiService implements AiSelectedPort {
    constructor(private ai_gemini: GoogleGenAI) {}
    geminiModel = "gemini-3.5-flash-lite";

    async generateMessage(message: string, options?: AiGenerateOptions): Promise<string> {
        const answer = await this.ai_gemini.interactions.create({
            model: this.geminiModel,
            input: this.buildInput(message, options?.history ?? []),
            system_instruction: options?.instructions,
        });
        return answer.output_text ?? '';
    }

    private buildInput(message: string, history: ConversationMessage[]): string {
        if (history.length === 0) {
            return message;
        }

        const transcript = history
            .map((entry) => `${entry.role === 'inbound' ? 'Usuario' : 'Asistente'}: ${entry.text}`)
            .join('\n');

        return `Conversación previa:\n${transcript}\n\nMensaje actual del usuario: ${message}`;
    }
}
