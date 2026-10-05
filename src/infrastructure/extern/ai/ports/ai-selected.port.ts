import { AiGenerateOptions } from '../../../../core/domain/ports/ai-port/ai.port.js';

export abstract class AiSelectedPort {
    abstract generateMessage(message: string, options?: AiGenerateOptions): Promise<string>;
}
