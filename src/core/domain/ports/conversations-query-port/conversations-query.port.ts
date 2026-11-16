import { ConversationMessageRole } from '../../entities/conversation-message.entity.js';

export interface ConversationPerson {
    id: string;
    phoneNumber: string;
    name: string | null;
    lastMessageAt: Date;
    lastMessagePreview: string;
}

export interface StoredConversationMessage {
    id: string;
    personId: string;
    role: ConversationMessageRole;
    text: string;
    timestamp: Date;
}

/** Posición de un mensaje; el siguiente bloque trae solo los anteriores a ella. */
export interface MessageCursor {
    createdAt: Date;
    id: string;
}

export interface MessagePageQuery {
    /** Incluye mensajes desde este instante. */
    from?: Date;
    /** Excluye mensajes desde este instante. */
    to?: Date;
    before?: MessageCursor;
    limit: number;
}

export interface MessagePage {
    /** Del más reciente al más antiguo. */
    items: StoredConversationMessage[];
    hasMore: boolean;
}

/** Lectura del historial para el panel de administración (solo consulta). */
export abstract class ConversationsQueryPort {
    abstract listPeople(search?: string): Promise<ConversationPerson[]>;
    abstract getPerson(personId: string): Promise<ConversationPerson | null>;
    abstract listMessages(personId: string, query: MessagePageQuery): Promise<MessagePage>;
}
