import { Person } from './person.entity.js';
import { Instructions } from './instructions.entity.js';
import { ConversationMessage } from './conversation-message.entity.js';

describe('domain entities', () => {
  it('construye una Person', () => {
    const person: Person = { id: 'p1', phoneNumber: '+15550000000', createdAt: new Date() };
    expect(person.phoneNumber).toBe('+15550000000');
  });

  it('construye Instructions', () => {
    const instructions: Instructions = { id: 'i1', content: 'Sos un asistente de Acme.', updatedAt: new Date() };
    expect(instructions.content).toContain('Acme');
  });

  it('construye un ConversationMessage', () => {
    const message: ConversationMessage = { role: 'inbound', text: 'hola', timestamp: new Date() };
    expect(message.role).toBe('inbound');
  });
});
