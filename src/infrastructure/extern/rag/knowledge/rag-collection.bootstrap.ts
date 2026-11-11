import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

const ALREADY_EXISTS = 409;

/** Asegura que exista la colección de conocimiento en Rag-API; si no responde, solo avisa y deja arrancar el bot. */
@Injectable()
export class RagCollectionBootstrap implements OnModuleInit {
    private readonly logger = new Logger(RagCollectionBootstrap.name);

    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService,
    ) {}

    async onModuleInit(): Promise<void> {
        const baseUrl = this.config.get<string>('RAG_API_URL') ?? 'http://localhost:3100';
        const name = this.config.get<string>('RAG_COLLECTION') ?? 'knowledge';

        try {
            await firstValueFrom(
                this.http.post(`${baseUrl}/collections`, { name }, { headers: { 'X-API-Key': this.config.get<string>('RAG_API_KEY') ?? '' } }),
            );
            this.logger.log(`Colección "${name}" creada en Rag-API`);
        } catch (error) {
            if ((error as AxiosError).response?.status === ALREADY_EXISTS) {
                return;
            }
            this.logger.warn(`No se pudo asegurar la colección "${name}" en Rag-API: ${error}`);
        }
    }
}
