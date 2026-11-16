import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ServiceTokenPort } from '../../../core/domain/ports/service-token-port/service-token.port.js';
import { TenantIdentityPort } from '../../../core/domain/ports/tenant-identity-port/tenant-identity.port.js';

/** Se renueva el token cuando faltan menos de 5 minutos para que expire. */
export const RENEW_MARGIN_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;
/** Tope de cada petición a container: sin él, un container colgado dejaría colgado el webhook. */
const HTTP_TIMEOUT_MS = 3000;
/** Tras fallar sin token utilizable, no se vuelve a llamar a container durante este tiempo (cada mensaje no paga los reintentos). */
const FAILURE_COOLDOWN_MS = 30_000;

const TOKEN_UNAVAILABLE = 'No se pudo obtener el token de servicio.';
const TENANT_UNAVAILABLE = 'No se pudo conocer el tenant de este despliegue.';

interface CachedToken {
    accessToken: string;
    expiresAt: number;
}

interface TokenResponse {
    accessToken?: unknown;
    expiresIn?: unknown;
}

/**
 * Único punto donde el bot habla con container-api: conoce su tenant (`GET /tenant`) y obtiene un token de
 * servicio (`POST /auth/service-token`). Todo se cachea en memoria; el arranque del bot no depende de container.
 */
@Injectable()
export class ContainerIdentityService implements TenantIdentityPort, ServiceTokenPort {
    private readonly logger = new Logger(ContainerIdentityService.name);

    private tenantCode?: string;
    private tenantInFlight?: Promise<string>;
    private token?: CachedToken;
    private refreshInFlight?: Promise<void>;
    private failedUntil = 0;

    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService,
    ) {}

    async getTenantCode(): Promise<string> {
        if (this.tenantCode) {
            return this.tenantCode;
        }

        if (!this.tenantInFlight) {
            this.tenantInFlight = this.fetchTenantCode().finally(() => {
                this.tenantInFlight = undefined;
            });
        }

        return this.tenantInFlight;
    }

    async getToken(): Promise<string> {
        if (this.token && this.token.expiresAt - Date.now() > RENEW_MARGIN_MS) {
            return this.token.accessToken;
        }

        // En enfriamiento tras un fallo: se usa el token vigente si lo hay y, si no, se responde 503 sin llamar a container.
        if (Date.now() < this.failedUntil) {
            return this.usableToken() ?? this.unavailable();
        }

        try {
            await this.refresh();
        } catch (error) {
            // Si container falla pero el token que ya tenemos aún no expiró, se sigue usando.
            const stillValid = this.usableToken();
            if (stillValid) {
                return stillValid;
            }
            this.failedUntil = Date.now() + FAILURE_COOLDOWN_MS;
            throw error instanceof ServiceUnavailableException ? error : new ServiceUnavailableException(TOKEN_UNAVAILABLE);
        }

        this.failedUntil = 0;
        return this.token!.accessToken;
    }

    invalidateToken(): void {
        this.token = undefined;
        this.failedUntil = 0;
    }

    private usableToken(): string | undefined {
        return this.token && this.token.expiresAt > Date.now() ? this.token.accessToken : undefined;
    }

    private unavailable(): never {
        throw new ServiceUnavailableException(TOKEN_UNAVAILABLE);
    }

    private baseUrl(): string {
        const url = this.config.get<string>('CONTAINER_API_URL');

        if (!url) {
            throw new ServiceUnavailableException('Falta CONTAINER_API_URL.');
        }

        return url.replace(/\/+$/, '');
    }

    private async fetchTenantCode(): Promise<string> {
        const baseUrl = this.baseUrl();

        try {
            const { data } = await firstValueFrom(this.http.get<{ code?: unknown }>(`${baseUrl}/tenant`, { timeout: HTTP_TIMEOUT_MS }));

            if (typeof data?.code !== 'string' || data.code.length === 0) {
                throw new Error('La respuesta de /tenant no trae code');
            }

            this.tenantCode = data.code;
            return data.code;
        } catch (error) {
            this.logger.warn(`No se pudo leer el tenant de container: ${describe(error)}`);
            throw new ServiceUnavailableException(TENANT_UNAVAILABLE);
        }
    }

    private refresh(): Promise<void> {
        if (!this.refreshInFlight) {
            this.refreshInFlight = this.requestTokenWithRetries().finally(() => {
                this.refreshInFlight = undefined;
            });
        }

        return this.refreshInFlight;
    }

    private async requestTokenWithRetries(): Promise<void> {
        const baseUrl = this.baseUrl();
        const clientId = this.config.get<string>('CONTAINER_CLIENT_ID');
        const clientSecret = this.config.get<string>('CONTAINER_CLIENT_SECRET');

        if (!clientId || !clientSecret) {
            throw new ServiceUnavailableException('Faltan CONTAINER_CLIENT_ID o CONTAINER_CLIENT_SECRET.');
        }

        let lastError: unknown;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                const { data } = await firstValueFrom(
                    this.http.post<TokenResponse>(`${baseUrl}/auth/service-token`, { clientId, clientSecret }, { timeout: HTTP_TIMEOUT_MS }),
                );
                this.token = parseToken(data);
                return;
            } catch (error) {
                lastError = error;
                this.logger.warn(`Intento ${attempt}/${MAX_ATTEMPTS} de obtener el token de servicio falló: ${describe(error)}`);

                // Credenciales rechazadas (4xx) o respuesta mal formada: repetir no cambia nada.
                if (!isRetriable(error) || attempt === MAX_ATTEMPTS) {
                    break;
                }
                await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
            }
        }

        throw lastError;
    }
}

class InvalidTokenResponseError extends Error {}

/** Se reintentan los errores de red y los 5xx (más 408 y 429); un 4xx o una respuesta inválida no mejoran al repetirse. */
function isRetriable(error: unknown): boolean {
    if (error instanceof InvalidTokenResponseError) {
        return false;
    }

    const status = (error as { response?: { status?: number } }).response?.status;
    return status === undefined || status >= 500 || status === 408 || status === 429;
}

function parseToken(data: TokenResponse | undefined): CachedToken {
    const accessToken = data?.accessToken;
    const expiresIn = data?.expiresIn;

    if (typeof accessToken !== 'string' || accessToken.length === 0) {
        throw new InvalidTokenResponseError('La respuesta del token no trae accessToken');
    }

    if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new InvalidTokenResponseError('La respuesta del token no trae un expiresIn válido');
    }

    return { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
}

/** Descripción segura para logs: nunca incluye cuerpos de petición ni respuesta (podrían llevar el secreto o el token). */
function describe(error: unknown): string {
    const { response, code, message } = error as { response?: { status?: number }; code?: string; message?: string };
    if (response?.status) return `HTTP ${response.status}`;
    if (code) return code;
    return error instanceof ServiceUnavailableException ? error.message : (message ?? 'error desconocido').slice(0, 120);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
