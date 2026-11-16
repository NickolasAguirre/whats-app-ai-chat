/** Quién es este bot frente al resto de la plataforma: el tenant al que pertenece. */
export abstract class TenantIdentityPort {
    /** `tenantCode` de este despliegue (único e inmutable). Falla con 503 si no se puede conocer. */
    abstract getTenantCode(): Promise<string>;
}
