export abstract class AiSelectedPort {
    abstract generateMessage(message:string): Promise<string>;
}