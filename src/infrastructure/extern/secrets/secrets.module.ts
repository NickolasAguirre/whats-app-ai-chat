import { Module } from '@nestjs/common';
import { EnvSecretsService } from './env-secrets.service.js';
import { SecretsPort } from '../../../core/domain/ports/secrets-port/secrets.port.js';

@Module({
    providers: [
        EnvSecretsService,
        { provide: SecretsPort, useExisting: EnvSecretsService },
    ],
    exports: [SecretsPort],
})
export class SecretsModule {}
