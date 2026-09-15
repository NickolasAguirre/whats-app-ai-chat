import { Inject, Injectable } from '@nestjs/common';
import { AiPort } from '../../../core/domain/ports/ai-port/ai.port.js';
import { AiSelectedPort } from './ports/ai-selected.port.js';
import { GEMINI_AI_PORT } from './gemini/gemini-proxy.module.js';
import { QWEN_AI_PORT } from './qwen/qwen.module.js';

@Injectable()
export class AiService implements AiPort {

    constructor(
        @Inject(GEMINI_AI_PORT) private readonly geminiProvider: AiSelectedPort,
        @Inject(QWEN_AI_PORT) private readonly qwenProvider: AiSelectedPort,
    ) {}

    private getProvider(): AiSelectedPort {
        return this.qwenProvider;
    }

    public async generateMessage(message: string): Promise<string> {
        const provider = this.getProvider();
        return await provider.generateMessage(message);
    }
}
