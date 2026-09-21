import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretsPort } from '../../../core/domain/ports/secrets-port/secrets.port.js';

@Injectable()
export class EnvSecretsService implements SecretsPort {
    constructor(private readonly config: ConfigService) {}

    async getSecret(ref: string): Promise<string> {
        const value = this.config.get<string>(ref);

        if (!value) {
            throw new Error(`Secret not found for ref: ${ref}`);
        }

        return value;
    }
}
