import { EntitySchema } from 'typeorm';
import { ConversationMessageRole } from '../../../core/domain/entities/conversation-message.entity.js';

/** Fila de la tabla `Message`: historial permanente de la conversación con cada persona. */
export interface StoredMessage {
    id: string;
    personId: string;
    role: ConversationMessageRole;
    content: string;
    providerMessageId: string | null;
    createdAt: Date;
}

export const MessageSchema = new EntitySchema<StoredMessage>({
    name: 'Message',
    tableName: 'Message',
    columns: {
        id: { type: 'uuid', primary: true, generated: 'uuid' },
        personId: { type: 'uuid' },
        role: { type: 'text' },
        content: { type: 'text' },
        providerMessageId: { type: 'text', nullable: true },
        createdAt: { type: 'timestamptz' },
    },
    uniques: [{ name: 'UQ_Message_providerMessageId', columns: ['providerMessageId'] }],
    indices: [{ name: 'IDX_Message_personId_createdAt', columns: ['personId', 'createdAt'] }],
});
