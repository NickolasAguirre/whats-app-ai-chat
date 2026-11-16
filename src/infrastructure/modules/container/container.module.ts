import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServiceTokenPort } from '../../../core/domain/ports/service-token-port/service-token.port.js';
import { TenantIdentityPort } from '../../../core/domain/ports/tenant-identity-port/tenant-identity.port.js';
import { ContainerIdentityService } from '../../extern/container/container-identity.service.js';

@Module({
    imports: [HttpModule, ConfigModule],
    providers: [
        ContainerIdentityService,
        { provide: TenantIdentityPort, useExisting: ContainerIdentityService },
        { provide: ServiceTokenPort, useExisting: ContainerIdentityService },
    ],
    exports: [TenantIdentityPort, ServiceTokenPort],
})
export class ContainerModule {}
