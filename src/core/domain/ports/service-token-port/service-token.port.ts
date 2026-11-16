/** Credencial con la que el bot se presenta ante otros servicios (p. ej. Rag-API). */
export abstract class ServiceTokenPort {
    /** Token vigente; se renueva solo antes de vencer. Falla con 503 si no hay uno utilizable. */
    abstract getToken(): Promise<string>;
    /** Descarta el token en caché (p. ej. porque el servicio destino lo rechazó); el siguiente `getToken` pide uno nuevo. */
    abstract invalidateToken(): void;
}
