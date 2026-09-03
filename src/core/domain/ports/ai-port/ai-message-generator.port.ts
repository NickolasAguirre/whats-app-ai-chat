export abstract class AiMessageGeneratorPort {
    abstract generate(message: string): Promise<string>;
}
