import { Injectable } from '@nestjs/common';
import { AiSelectedPort } from '../ports/ai-selected.port.js';
import { AiGenerateOptions } from '../../../../core/domain/ports/ai-port/ai.port.js';
import OpenAI from 'openai';

@Injectable()
export class QwenService implements AiSelectedPort {
    constructor(private open_ai: OpenAI) {}
    model = 'qwen3.7-flash';

    async generateMessage(message: string, options?: AiGenerateOptions): Promise<string> {
        const history = (options?.history ?? []).map((entry) => ({
            role: entry.role === 'inbound' ? ('user' as const) : ('assistant' as const),
            content: entry.text,
        }));

        const response = await this.open_ai.responses.create({
            model: this.model,
            instructions: options?.instructions,
            input: [...history, { role: 'user' as const, content: message }],
        });

        return response.output_text ?? '';
    }
}
