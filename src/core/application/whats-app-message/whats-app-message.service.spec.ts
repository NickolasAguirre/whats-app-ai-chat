import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappMessagesControllerService } from './whats-app-message.service.js';
import { InstructionsService } from '../instructions/instructions.service.js';
import { AiPort } from '../../domain/ports/ai-port/ai.port.js';
import { WhatsAppPort } from '../../domain/ports/whats-app-port/whats-app.port.js';
import { PersonRepositoryPort } from '../../domain/ports/person-port/person.port.js';
import { KnowledgePort } from '../../domain/ports/knowledge-port/knowledge.port.js';
import { MessageMemoryPort } from '../../domain/ports/message-memory-port/message-memory.port.js';
import { MessageHistoryPort } from '../../domain/ports/message-history-port/message-history.port.js';

describe('WhatsappMessagesControllerService', () => {
  let service: WhatsappMessagesControllerService;
  const aiMock = { generateMessage: vi.fn() };
  const whatsAppMock = { sendMessage: vi.fn() };
  const personMock = { findOrCreate: vi.fn() };
  const instructionsMock = { getEffective: vi.fn() };
  const knowledgeMock = { search: vi.fn() };
  const memoryMock = { getRecentMessages: vi.fn(), appendMessage: vi.fn() };
  const historyMock = { save: vi.fn(), findRecent: vi.fn(), discard: vi.fn() };
  const person = { id: 'p1', phoneNumber: '+1555', createdAt: new Date() };
  const defaultInstructions = { content: 'Instrucciones por defecto', updatedAt: null, isDefault: true };

  beforeEach(async () => {
    vi.resetAllMocks();
    personMock.findOrCreate.mockResolvedValue(person);
    instructionsMock.getEffective.mockResolvedValue(defaultInstructions);
    knowledgeMock.search.mockResolvedValue([]);
    memoryMock.getRecentMessages.mockResolvedValue([]);
    historyMock.save.mockResolvedValueOnce('m1').mockResolvedValue('m2');
    historyMock.findRecent.mockResolvedValue([]);
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
        { provide: MessageHistoryPort, useValue: historyMock },
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
  describe('historial en BD', () => {
    it('guarda el entrante antes de llamar al LLM y la respuesta después, con el id del proveedor', async () => {
      await service.handleIncomingMessage('+1555', '+1999', 'hola', 'Nico', 'wamid.1');

      expect(historyMock.save).toHaveBeenNthCalledWith(1, expect.objectContaining({ personId: 'p1', role: 'inbound', content: 'hola', providerMessageId: 'wamid.1' }));
      expect(historyMock.save).toHaveBeenNthCalledWith(2, expect.objectContaining({ personId: 'p1', role: 'outbound', content: 'la respuesta' }));
      expect(historyMock.save.mock.calls[1][0].providerMessageId).toBeUndefined();
      expect(historyMock.save.mock.invocationCallOrder[0]).toBeLessThan(aiMock.generateMessage.mock.invocationCallOrder[0]);
      expect(historyMock.save.mock.invocationCallOrder[1]).toBeGreaterThan(aiMock.generateMessage.mock.invocationCallOrder[0]);
    });

    it('un reenvío del webhook (mensaje ya guardado) no genera otra respuesta', async () => {
      historyMock.save.mockReset();
      historyMock.save.mockResolvedValue(null);

      await service.handleIncomingMessage('+1555', '+1999', 'hola', undefined, 'wamid.1');

      expect(aiMock.generateMessage).not.toHaveBeenCalled();
      expect(whatsAppMock.sendMessage).not.toHaveBeenCalled();
      expect(memoryMock.appendMessage).not.toHaveBeenCalled();
    });

    it('si falla guardar el entrante en la BD, igual responde', async () => {
      historyMock.save.mockReset();
      historyMock.save.mockRejectedValue(new Error('db down'));

      await service.handleIncomingMessage('+1555', '+1999', 'hola');

      expect(aiMock.generateMessage).toHaveBeenCalled();
      expect(whatsAppMock.sendMessage).toHaveBeenCalled();
    });

    it('si falla guardar la respuesta en la BD, igual la envía por WhatsApp', async () => {
      historyMock.save.mockReset();
      historyMock.save.mockResolvedValueOnce('m1').mockRejectedValueOnce(new Error('db down'));

      await service.handleIncomingMessage('+1555', '+1999', 'hola');

      expect(whatsAppMock.sendMessage).toHaveBeenCalled();
    });

    it('si Redis no tiene contexto, usa los últimos 20 mensajes de la BD sin el mensaje actual', async () => {
      const fromDb = [{ role: 'inbound' as const, text: 'de la BD', timestamp: new Date() }];
      historyMock.findRecent.mockResolvedValue(fromDb);

      await service.handleIncomingMessage('+1555', '+1999', 'hola');

      expect(historyMock.findRecent).toHaveBeenCalledWith('p1', 20, 'm1');
      expect(aiMock.generateMessage).toHaveBeenCalledWith('hola', expect.objectContaining({ history: fromDb }));
    });

    it('si Redis estaba vacío, lo vuelve a sembrar con el contexto de la BD (en orden) para el siguiente mensaje', async () => {
      const fromDb = [
        { role: 'inbound' as const, text: 'uno', timestamp: new Date() },
        { role: 'outbound' as const, text: 'dos', timestamp: new Date() },
      ];
      historyMock.findRecent.mockResolvedValue(fromDb);

      await service.handleIncomingMessage('+1555', '+1999', 'hola');

      expect(memoryMock.appendMessage.mock.calls.slice(0, 2)).toEqual([['p1', fromDb[0]], ['p1', fromDb[1]]]);
    });

    it('si Redis tiene contexto, no consulta la BD', async () => {
      memoryMock.getRecentMessages.mockResolvedValue([{ role: 'inbound', text: 'x', timestamp: new Date() }]);

      await service.handleIncomingMessage('+1555', '+1999', 'hola');

      expect(historyMock.findRecent).not.toHaveBeenCalled();
    });

    it('si Redis falla, el contexto sale de la BD', async () => {
      memoryMock.getRecentMessages.mockRejectedValue(new Error('redis down'));
      const fromDb = [{ role: 'outbound' as const, text: 'previo', timestamp: new Date() }];
      historyMock.findRecent.mockResolvedValue(fromDb);

      await service.handleIncomingMessage('+1555', '+1999', 'hola');

      expect(aiMock.generateMessage).toHaveBeenCalledWith('hola', expect.objectContaining({ history: fromDb }));
      expect(memoryMock.appendMessage).not.toHaveBeenCalledWith('p1', fromDb[0]);
    });

    it('si fallan Redis y la BD, responde con contexto vacío', async () => {
      memoryMock.getRecentMessages.mockRejectedValue(new Error('redis down'));
      historyMock.findRecent.mockRejectedValue(new Error('db down'));

      await service.handleIncomingMessage('+1555', '+1999', 'hola');

      expect(aiMock.generateMessage).toHaveBeenCalledWith('hola', expect.objectContaining({ history: [] }));
      expect(whatsAppMock.sendMessage).toHaveBeenCalled();
    });
    it('si falla el LLM, libera el entrante para que el reintento del webhook lo procese y no guarda nada más', async () => {
      aiMock.generateMessage.mockRejectedValue(new Error('llm down'));

      await expect(service.handleIncomingMessage('+1555', '+1999', 'hola', undefined, 'wamid.1')).rejects.toThrow('llm down');

      expect(historyMock.discard).toHaveBeenCalledWith('m1');
      expect(historyMock.save).toHaveBeenCalledTimes(1);
      expect(memoryMock.appendMessage).not.toHaveBeenCalled();
      expect(whatsAppMock.sendMessage).not.toHaveBeenCalled();
    });

    it('si falla el envío por WhatsApp, libera el entrante y no deja la respuesta en Redis ni en la BD', async () => {
      whatsAppMock.sendMessage.mockRejectedValue(new Error('ycloud down'));

      await expect(service.handleIncomingMessage('+1555', '+1999', 'hola', undefined, 'wamid.1')).rejects.toThrow('ycloud down');

      expect(historyMock.discard).toHaveBeenCalledWith('m1');
      expect(historyMock.save).toHaveBeenCalledTimes(1);
      expect(memoryMock.appendMessage).not.toHaveBeenCalled();
    });

    it('si además falla liberar el entrante, el error original es el que se propaga', async () => {
      aiMock.generateMessage.mockRejectedValue(new Error('llm down'));
      historyMock.discard.mockRejectedValue(new Error('db down'));

      await expect(service.handleIncomingMessage('+1555', '+1999', 'hola')).rejects.toThrow('llm down');
    });

    it('con el entrante procesado con éxito no se libera nada', async () => {
      await service.handleIncomingMessage('+1555', '+1999', 'hola');

      expect(historyMock.discard).not.toHaveBeenCalled();
    });
  });
});
