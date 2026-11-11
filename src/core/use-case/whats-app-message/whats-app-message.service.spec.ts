import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessagesControllerService } from './whats-app-message.service.js';
import { InstructionsService } from '../instructions/instructions.service.js';
import { AiPort } from '../../domain/ports/ai-port/ai.port.js';
import { WhatsAppPort } from '../../domain/ports/whats-app-port/whats-app.port.js';
import { PersonRepositoryPort } from '../../domain/ports/person-port/person.port.js';
import { KnowledgePort } from '../../domain/ports/knowledge-port/knowledge.port.js';
import { MessageMemoryPort } from '../../domain/ports/message-memory-port/message-memory.port.js';

describe('WhatsappMessagesControllerService', () => {
  let service: WhatsappMessagesControllerService;
  const aiMock = { generateMessage: vi.fn() };
  const whatsAppMock = { sendMessage: vi.fn() };
  const personMock = { findOrCreate: vi.fn() };
  const instructionsMock = { getEffective: vi.fn() };
  const knowledgeMock = { search: vi.fn() };
  const memoryMock = { getRecentMessages: vi.fn(), appendMessage: vi.fn() };
  const person = { id: 'p1', phoneNumber: '+1555', createdAt: new Date() };
  const defaultInstructions = { content: 'Instrucciones por defecto', updatedAt: null, isDefault: true };

  beforeEach(async () => {
    vi.resetAllMocks();
    personMock.findOrCreate.mockResolvedValue(person);
    instructionsMock.getEffective.mockResolvedValue(defaultInstructions);
    knowledgeMock.search.mockResolvedValue([]);
    memoryMock.getRecentMessages.mockResolvedValue([]);
    aiMock.generateMessage.mockResolvedValue('la respuesta');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappMessagesControllerService,
        { provide: AiPort, useValue: aiMock },
        { provide: WhatsAppPort, useValue: whatsAppMock },
        { provide: PersonRepositoryPort, useValue: personMock },
        { provide: InstructionsService, useValue: instructionsMock },
        { provide: KnowledgePort, useValue: knowledgeMock },
        { provide: MessageMemoryPort, useValue: memoryMock },
      ],
    }).compile();

    service = module.get<WhatsappMessagesControllerService>(WhatsappMessagesControllerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('handleIncomingMessage arma el contexto (instrucciones, conocimiento e historial) y responde por WhatsApp', async () => {
    const history = [{ role: 'inbound' as const, text: 'mensaje viejo', timestamp: new Date() }];
    instructionsMock.getEffective.mockResolvedValue({ content: 'Sé breve.', updatedAt: new Date(), isDefault: false });
    knowledgeMock.search.mockResolvedValue(['Abrimos de 9 a 18 h.']);
    memoryMock.getRecentMessages.mockResolvedValue(history);

    await service.handleIncomingMessage('+1555', '+1999', 'hola');

    expect(personMock.findOrCreate).toHaveBeenCalledWith('+1555', undefined);
    expect(knowledgeMock.search).toHaveBeenCalledWith('hola');
    expect(memoryMock.getRecentMessages).toHaveBeenCalledWith('p1');
    expect(aiMock.generateMessage).toHaveBeenCalledWith('hola', {
      instructions: 'Sé breve.',
      knowledge: ['Abrimos de 9 a 18 h.'],
      history,
    });
    expect(memoryMock.appendMessage).toHaveBeenCalledTimes(2);
    expect(whatsAppMock.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ from: '+1999', to: '+1555', text: expect.objectContaining({ body: 'la respuesta' }) }),
    );
  });

  it('usa las instrucciones por defecto cuando el cliente no definió ninguna', async () => {
    await service.handleIncomingMessage('+1555', '+1999', 'hola');

    expect(aiMock.generateMessage).toHaveBeenCalledWith('hola', { instructions: 'Instrucciones por defecto', knowledge: [], history: [] });
  });

  it('si Rag-API falla al buscar conocimiento, responde igual sin fragmentos', async () => {
    knowledgeMock.search.mockRejectedValue(new Error('rag down'));

    await service.handleIncomingMessage('+1555', '+1999', 'hola');

    expect(aiMock.generateMessage).toHaveBeenCalledWith('hola', expect.objectContaining({ knowledge: [] }));
    expect(whatsAppMock.sendMessage).toHaveBeenCalled();
  });

  it('degrada sin memoria si Redis falla al leer el historial, y sigue respondiendo', async () => {
    memoryMock.getRecentMessages.mockRejectedValue(new Error('redis down'));

    await service.handleIncomingMessage('+1555', '+1999', 'hola');

    expect(aiMock.generateMessage).toHaveBeenCalledWith('hola', expect.objectContaining({ history: [] }));
    expect(whatsAppMock.sendMessage).toHaveBeenCalled();
  });

  it('no aborta la respuesta si Redis falla al guardar el mensaje', async () => {
    memoryMock.appendMessage.mockRejectedValue(new Error('redis down'));

    await service.handleIncomingMessage('+1555', '+1999', 'hola');

    expect(whatsAppMock.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ from: '+1999', to: '+1555', text: expect.objectContaining({ body: 'la respuesta' }) }),
    );
  });
});
