export abstract class SecretsPort {
    abstract getSecret(ref: string): Promise<string>;
}
