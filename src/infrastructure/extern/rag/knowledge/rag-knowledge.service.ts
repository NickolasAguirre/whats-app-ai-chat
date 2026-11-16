import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import { KnowledgeItem } from '../../../../core/domain/entities/knowledge-item.entity.js';
import {
    KnowledgeFileInput,
    KnowledgeNoteInput,
    KnowledgePort,
} from '../../../../core/domain/ports/knowledge-port/knowledge.port.js';
import { ServiceTokenPort } from '../../../../core/domain/ports/service-token-port/service-token.port.js';
import { KNOWLEDGE_COLLECTION } from '../../../../core/domain/tenant.js';

interface RagDocument {
    id: string;
    kind: KnowledgeItem['kind'];
    title: string;
    status: KnowledgeItem['status'];
    createdAt: string;
    sizeBytes?: number;
    content?: string;
    errorMessage?: string;
}

interface RagSearchHit {
    text: string;
    score: number;
}

const DEFAULT_TOP_K = 4;
const DEFAULT_MIN_SCORE = 0.35;
const UNAVAILABLE_MESSAGE = 'No se pudo conectar con el servicio de conocimiento.';
const CREDENTIAL_REJECTED_MESSAGE = 'El servicio de conocimiento rechazó la credencial del bot.';
/** Tope de cada petición a Rag-API: sin él, un Rag-API colgado dejaría colgado el webhook. */
const REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class RagKnowledgeService implements KnowledgePort {
    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService,
        private readonly serviceToken: ServiceTokenPort,
    ) {}

    async list(): Promise<KnowledgeItem[]> {
        const documents = await this.request<RagDocument[]>({ method: 'GET', url: this.documentsUrl() });
        return documents.map(toKnowledgeItem);
    }

    async uploadFile(file: KnowledgeFileInput): Promise<KnowledgeItem> {
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }), file.name);

        const document = await this.request<RagDocument>({ method: 'POST', url: this.documentsUrl(), data: form });
        return toKnowledgeItem(document);
    }

    async createNote(input: KnowledgeNoteInput): Promise<KnowledgeItem> {
        const document = await this.request<RagDocument>({ method: 'POST', url: `${this.documentsUrl()}/text`, data: input });
        return toKnowledgeItem(document);
    }

    async updateNote(id: string, input: KnowledgeNoteInput): Promise<KnowledgeItem> {
        const document = await this.request<RagDocument>({
            method: 'PUT',
            url: `${this.documentsUrl()}/${encodeURIComponent(id)}/text`,
            data: input,
        });
        return toKnowledgeItem(document);
    }

    async remove(id: string): Promise<void> {
        await this.request<void>({ method: 'DELETE', url: `${this.documentsUrl()}/${encodeURIComponent(id)}` });
    }

    async search(query: string): Promise<string[]> {
        const { results } = await this.request<{ results: RagSearchHit[] }>({
            method: 'POST',
            url: `${this.collectionUrl()}/search`,
            data: { query, topK: this.number('KNOWLEDGE_TOP_K', DEFAULT_TOP_K) },
        });
        const minScore = this.number('KNOWLEDGE_MIN_SCORE', DEFAULT_MIN_SCORE);

        return results.filter((hit) => hit.score >= minScore).map((hit) => hit.text);
    }

    private async request<T>(options: AxiosRequestConfig, retriedAfterRejection = false): Promise<T> {
        // Fuera del try: si no hay token, el 503 del puerto se propaga tal cual (no se mezcla con los errores HTTP de Rag-API).
        const token = await this.serviceToken.getToken();

        try {
            const response = await firstValueFrom(
                this.http.request<T>({
                    timeout: REQUEST_TIMEOUT_MS,
                    ...options,
                    headers: { ...options.headers, Authorization: `Bearer ${token}` },
                }),
            );
            return response.data;
        } catch (error) {
            const axiosError = error as AxiosError<{ message?: string | string[] }>;

            if (!axiosError.response) {
                throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
            }

            // 401: el token de servicio fue rechazado. Se descarta y se reintenta una vez; si vuelve a fallar es un 503 del servicio
            // (un 401 llegaría al panel y su interceptor cerraría la sesión del usuario, que no tiene la culpa).
            if (axiosError.response.status === 401) {
                if (retriedAfterRejection) {
                    throw new ServiceUnavailableException(CREDENTIAL_REJECTED_MESSAGE);
                }
                this.serviceToken.invalidateToken();
                return this.request<T>(options, true);
            }

            const message = axiosError.response.data?.message;
            throw new HttpException(Array.isArray(message) ? message.join(' ') : (message ?? 'Error en el servicio de conocimiento.'), axiosError.response.status);
        }
    }

    private collectionUrl(): string {
        const baseUrl = this.config.get<string>('RAG_API_URL') ?? 'http://localhost:3100';
        return `${baseUrl}/collections/${encodeURIComponent(KNOWLEDGE_COLLECTION)}`;
    }

    private documentsUrl(): string {
        return `${this.collectionUrl()}/documents`;
    }

    private number(key: string, fallback: number): number {
        const value = Number(this.config.get<string>(key));
        return Number.isFinite(value) && value > 0 ? value : fallback;
    }
}

function toKnowledgeItem(document: RagDocument): KnowledgeItem {
    return {
        id: document.id,
        kind: document.kind,
        title: document.title,
        status: document.status,
        createdAt: new Date(document.createdAt),
        sizeBytes: document.sizeBytes ?? undefined,
        content: document.content ?? undefined,
        errorMessage: document.errorMessage ?? undefined,
    };
}
