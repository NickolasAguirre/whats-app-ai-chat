export type ConversationMessageRole = 'inbound' | 'outbound';

export class ConversationMessage {
  role: ConversationMessageRole;
  text: string;
  timestamp: Date;
}
