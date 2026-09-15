export abstract class AiPort {
    abstract generateMessage(message: string): Promise<string>;
}
