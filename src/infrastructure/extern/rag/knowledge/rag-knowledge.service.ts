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

@Injectable()
export class RagKnowledgeService implements KnowledgePort {
    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService,
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

    private async request<T>(options: AxiosRequestConfig): Promise<T> {
        try {
            const response = await firstValueFrom(
                this.http.request<T>({
                    ...options,
                    headers: { ...options.headers, 'X-API-Key': this.config.get<string>('RAG_API_KEY') ?? '' },
                }),
            );
            return response.data;
        } catch (error) {
            const axiosError = error as AxiosError<{ message?: string | string[] }>;

            if (!axiosError.response) {
                throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
            }

            const message = axiosError.response.data?.message;
            throw new HttpException(Array.isArray(message) ? message.join(' ') : (message ?? 'Error en el servicio de conocimiento.'), axiosError.response.status);
        }
    }

    private collectionUrl(): string {
        const baseUrl = this.config.get<string>('RAG_API_URL') ?? 'http://localhost:3100';
        const collection = this.config.get<string>('RAG_COLLECTION') ?? 'knowledge';
        return `${baseUrl}/collections/${encodeURIComponent(collection)}`; 
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
