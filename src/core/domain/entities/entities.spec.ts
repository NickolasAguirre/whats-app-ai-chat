import { Tenant } from './tenant.entity.js';
import { WhatsAppNumber } from './whats-app-number.entity.js';
import { Person } from './person.entity.js';
import { Instructions } from './instructions.entity.js';
import { ConversationMessage } from './conversation-message.entity.js';

describe('multi-tenant domain entities', () => {
  it('construye un Tenant', () => {
    const tenant: Tenant = { id: 't1', name: 'Acme', active: true, createdAt: new Date() };
    expect(tenant.name).toBe('Acme');
  });

  it('construye un WhatsAppNumber ligado a un tenant', () => {
    const number: WhatsAppNumber = {
      id: 'w1', tenantId: 't1', phoneNumber: '+15551234567', wabaId: 'waba1',
      ycloudApiKeySecretRef: 'TENANT_T1_API_KEY', webhookSecretRef: 'TENANT_T1_WEBHOOK_SECRET', active: true,
    };
    expect(number.tenantId).toBe('t1');
  });

  it('construye una Person ligada a un tenant', () => {
    const person: Person = { id: 'p1', tenantId: 't1', phoneNumber: '+15550000000', createdAt: new Date() };
    expect(person.tenantId).toBe('t1');
  });

  it('construye Instructions ligadas a un tenant', () => {
    const instructions: Instructions = { id: 'i1', tenantId: 't1', content: 'Sos un asistente de Acme.', updatedAt: new Date() };
    expect(instructions.content).toContain('Acme');
  });

  it('construye un ConversationMessage', () => {
    const message: ConversationMessage = { role: 'inbound', text: 'hola', timestamp: new Date() };
    expect(message.role).toBe('inbound');
  });
});
