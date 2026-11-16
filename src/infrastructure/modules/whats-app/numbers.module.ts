import { Module } from '@nestjs/common';
import { NumbersPort } from '../../../core/domain/ports/numbers-port/numbers.port.js';
import { EnvNumbersService } from '../../extern/whats-app/env-numbers.service.js';

@Module({
    providers: [EnvNumbersService, { provide: NumbersPort, useExisting: EnvNumbersService }],
    exports: [NumbersPort],
})
export class NumbersModule {}
