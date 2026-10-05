import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessagesControllerService } from './whats-app-message.service.js';
import { AiPort } from '../../domain/ports/ai-port/ai.port.js';
import { WhatsAppPort } from '../../domain/ports/whats-app-port/whats-app.port.js';
import { PersonRepositoryPort } from '../../domain/ports/person-port/person.port.js';
import { InstructionsRepositoryPort } from '../../domain/ports/instructions-port/instructions.port.js';
import { MessageMemoryPort } from '../../domain/ports/message-memory-port/message-memory.port.js';

describe('WhatsappMessagesControllerService', () => {
  let service: WhatsappMessagesControllerService;
  const aiMock = { generateMessage: vi.fn() };
  const whatsAppMock = { sendMessage: vi.fn() };
  const personMock = { findOrCreate: vi.fn() };
  const instructionsMock = { getForTenant: vi.fn() };
  const memoryMock = { getRecentMessages: vi.fn(), appendMessage: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappMessagesControllerService,
        { provide: AiPort, useValue: aiMock },
        { provide: WhatsAppPort, useValue: whatsAppMock },
        { provide: PersonRepositoryPort, useValue: personMock },
        { provide: InstructionsRepositoryPort, useValue: instructionsMock },
        { provide: MessageMemoryPort, useValue: memoryMock },
      ],
    }).compile();

    service = module.get<WhatsappMessagesControllerService>(WhatsappMessagesControllerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('handleIncomingMessage arma el contexto del tenant y responde por WhatsApp', async () => {
    const person = { id: 'p1', tenantId: 't1', phoneNumber: '+1555', createdAt: new Date() };
    const instructions = { id: 'i1', tenantId: 't1', content: 'Sé breve.', updatedAt: new Date() };
    const history = [{ role: 'inbound' as const, text: 'mensaje viejo', timestamp: new Date() }];

    personMock.findOrCreate.mockResolvedValueOnce(person);
    instructionsMock.getForTenant.mockResolvedValueOnce(instructions);
    memoryMock.getRecentMessages.mockResolvedValueOnce(history);
    aiMock.generateMessage.mockResolvedValueOnce('la respuesta');

    await service.handleIncomingMessage('t1', '+1555', '+1999', 'hola');

    expect(personMock.findOrCreate).toHaveBeenCalledWith('t1', '+1555', undefined);
    expect(instructionsMock.getForTenant).toHaveBeenCalledWith('t1');
    expect(memoryMock.getRecentMessages).toHaveBeenCalledWith('t1', 'p1');
    expect(aiMock.generateMessage).toHaveBeenCalledWith('hola', { instructions: 'Sé breve.', history });
    expect(memoryMock.appendMessage).toHaveBeenCalledTimes(2);
    expect(whatsAppMock.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ from: '+1999', to: '+1555', text: expect.objectContaining({ body: 'la respuesta' }) }),
    );
  });

  it('handleIncomingMessage funciona sin instructions definidas para el tenant', async () => {
    const person = { id: 'p1', tenantId: 't1', phoneNumber: '+1555', createdAt: new Date() };
    personMock.findOrCreate.mockResolvedValueOnce(person);
    instructionsMock.getForTenant.mockResolvedValueOnce(null);
    memoryMock.getRecentMessages.mockResolvedValueOnce([]);
    aiMock.generateMessage.mockResolvedValueOnce('la respuesta');

    await service.handleIncomingMessage('t1', '+1555', '+1999', 'hola');

    expect(aiMock.generateMessage).toHaveBeenCalledWith('hola', { instructions: undefined, history: [] });
  });

  it('degrada sin memoria si Redis falla al leer el historial, y sigue respondiendo', async () => {
    const person = { id: 'p1', tenantId: 't1', phoneNumber: '+1555', createdAt: new Date() };
    personMock.findOrCreate.mockResolvedValueOnce(person);
    instructionsMock.getForTenant.mockResolvedValueOnce(null);
    memoryMock.getRecentMessages.mockRejectedValueOnce(new Error('redis down'));
    aiMock.generateMessage.mockResolvedValueOnce('la respuesta');

    await service.handleIncomingMessage('t1', '+1555', '+1999', 'hola');

    expect(aiMock.generateMessage).toHaveBeenCalledWith('hola', { instructions: undefined, history: [] });
    expect(whatsAppMock.sendMessage).toHaveBeenCalled();
  });

  it('no aborta la respuesta si Redis falla al guardar el mensaje', async () => {
    const person = { id: 'p1', tenantId: 't1', phoneNumber: '+1555', createdAt: new Date() };
    personMock.findOrCreate.mockResolvedValueOnce(person);
    instructionsMock.getForTenant.mockResolvedValueOnce(null);
    memoryMock.getRecentMessages.mockResolvedValueOnce([]);
    memoryMock.appendMessage.mockRejectedValue(new Error('redis down'));
    aiMock.generateMessage.mockResolvedValueOnce('la respuesta');

    await service.handleIncomingMessage('t1', '+1555', '+1999', 'hola');

    expect(whatsAppMock.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ from: '+1999', to: '+1555', text: expect.objectContaining({ body: 'la respuesta' }) }),
    );
  });
});
