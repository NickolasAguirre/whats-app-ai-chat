import { AuthenticationRegistry, JwtBearerProvider, JwtClaims } from '@nestjs/authentication';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Formato del `tenantCode` que firma container: minúsculas, números, "-" y "_"; hasta 63 caracteres. */
const TENANT_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;

@Injectable()
export class JwtAuth extends JwtBearerProvider<any> {
    constructor(registry: AuthenticationRegistry, configService: ConfigService) {
        
        super({key: configService.get<string>("JWT_PUBLIC_KEY"),issuer: 'container-api',audience: 'whatsapp-chat-bot', realm: 'store'});
        registry.registerProvider(this);
    }

    //   key: configService.get<string>("JWT_PUBLIC_KEY") ?? "",
    // issuer: 'container-api',
    // audience: 'whatsapp-chat-bot',
    // ttl: '1h', 
    // Called after the signature and claims checked out.
    // Returning null (the user was deleted) rejects the token.
    // El valor devuelto queda en `request.user`: de ahí lo lee TenantMatchGuard.
    validate({ sub, tenantCode }: JwtClaims): { sub: string; tenantCode: string } | null {
        if (typeof sub !== 'string' || sub.length === 0) {
            return null;
        }

        if (typeof tenantCode !== 'string' || !TENANT_CODE_PATTERN.test(tenantCode)) {
            return null;
        }

        return { sub, tenantCode };
    }
}
