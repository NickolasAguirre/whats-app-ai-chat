import { KnowledgeItem } from '../../entities/knowledge-item.entity.js';

export interface KnowledgeFileInput {
    name: string;
    mimeType: string;
    bytes: Buffer;
}

export interface KnowledgeNoteInput {
    title: string;
    content: string;
}

export abstract class KnowledgePort {
    abstract list(): Promise<KnowledgeItem[]>;
    abstract uploadFile(file: KnowledgeFileInput): Promise<KnowledgeItem>;
    abstract createNote(input: KnowledgeNoteInput): Promise<KnowledgeItem>;
    abstract updateNote(id: string, input: KnowledgeNoteInput): Promise<KnowledgeItem>;
    abstract remove(id: string): Promise<void>;
    /** Fragmentos del conocimiento más parecidos a la consulta, ya filtrados por puntaje mínimo. */
    abstract search(query: string): Promise<string[]>;
}
