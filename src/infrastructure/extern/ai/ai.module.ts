import { Module } from '@nestjs/common';
import { AiService } from './ai.service.js';
import { GeminiModule } from './gemini/gemini-proxy.module.js';
import { QwenModule } from './qwen/qwen.module.js';
import { AiPort } from '../../../core/domain/ports/ai-port/ai.port.js';

@Module({
    imports: [GeminiModule, QwenModule],
    providers: [
        AiService,
        { provide: AiPort, useExisting: AiService },
    ],
    exports: [AiPort]
})
export class AiModule {}
