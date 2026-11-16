import { ConversationMessage, ConversationMessageRole } from '../../entities/conversation-message.entity.js';

export interface NewHistoryMessage {
    personId: string;
    role: ConversationMessageRole;
    content: string;
    /** Id del mensaje en el proveedor (YCloud); único, sirve para descartar reenvíos del webhook. */
    providerMessageId?: string;
    createdAt: Date;
}

/** Historial permanente de mensajes en BD (para revisar conversaciones); Redis solo guarda el contexto reciente. */
export abstract class MessageHistoryPort {
    /** Guarda el mensaje; devuelve su id, o null si ya existía ese `providerMessageId`. */
    abstract save(message: NewHistoryMessage): Promise<string | null>;
    /** Borra un mensaje (se usa para que el reintento del webhook pueda volver a procesar uno que no llegó a responderse). */
    abstract discard(id: string): Promise<void>;
    /** Últimos `limit` mensajes de la persona en orden cronológico, sin el mensaje `excludeId`. */
    abstract findRecent(personId: string, limit: number, excludeId?: string): Promise<ConversationMessage[]>;
}
