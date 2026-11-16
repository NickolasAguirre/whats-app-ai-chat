import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { TenantIdentityPort } from '../../core/domain/ports/tenant-identity-port/tenant-identity.port.js';

/** En `/admin/*` solo entra quien trae un token del mismo tenant que este bot. */
@Injectable()
export class TenantMatchGuard implements CanActivate {
    constructor(@Inject(TenantIdentityPort) private readonly tenantIdentity: TenantIdentityPort) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const principal = context.switchToHttp().getRequest<Request & { user?: { tenantCode?: string } | null }>().user;

        if (!principal?.tenantCode) {
            throw new ForbiddenException('El token no trae tenant.');
        }

        if (principal.tenantCode !== (await this.tenantIdentity.getTenantCode())) {
            throw new ForbiddenException('El token pertenece a otro tenant.');
        }

        return true;
    }
}
