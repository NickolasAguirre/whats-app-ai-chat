export type KnowledgeKind = 'pdf' | 'spreadsheet' | 'image' | 'text' | 'note';
export type KnowledgeStatus = 'processing' | 'ready' | 'failed';

export class KnowledgeItem {
    id: string;
    kind: KnowledgeKind;
    title: string;
    status: KnowledgeStatus;
    createdAt: Date;
    sizeBytes?: number;
    content?: string;
    errorMessage?: string;
}
