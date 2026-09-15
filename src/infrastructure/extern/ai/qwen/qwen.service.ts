import { Injectable } from '@nestjs/common';
import { AiSelectedPort } from '../ports/ai-selected.port.js';
import OpenAI from 'openai';

@Injectable()
export class QwenService implements AiSelectedPort {
    constructor(private open_ai: OpenAI) { }
    model = 'qwen3.7-flash';

    async generateMessage(message: string): Promise<string> {
        try {
            const response = await this.open_ai.responses.create({
                model: this.model,
                input: 'Mi nombre es Nickolas',
            });

            return response.output_text ?? '';
        } catch (ex) { 
            const error = ex;
            return ""
        }
    }
}
