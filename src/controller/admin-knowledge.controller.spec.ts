import { BadRequestException } from '@nestjs/common';
import { AdminKnowledgeController } from './admin-knowledge.controller.js';

describe('AdminKnowledgeController', () => {
  const knowledgeMock = { list: vi.fn(), uploadFile: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), remove: vi.fn() };
  const controller = new AdminKnowledgeController(knowledgeMock as never);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('delega en el puerto de conocimiento (el tenant ya no se pasa: va en el token de servicio)', async () => {
    knowledgeMock.list.mockResolvedValue([]);

    await controller.list();
    await controller.createNote({ title: 't', content: 'c' });
    await controller.updateNote('d1', { title: 't2', content: 'c2' });
    await controller.remove('d1');

    expect(knowledgeMock.list).toHaveBeenCalledWith();
    expect(knowledgeMock.createNote).toHaveBeenCalledWith({ title: 't', content: 'c' });
    expect(knowledgeMock.updateNote).toHaveBeenCalledWith('d1', { title: 't2', content: 'c2' });
    expect(knowledgeMock.remove).toHaveBeenCalledWith('d1');
  });

  it('uploadFile recupera el nombre UTF-8', async () => {
    const originalname = Buffer.from('catálogo.pdf', 'utf8').toString('latin1');

    await controller.uploadFile({ originalname, mimetype: 'application/pdf', buffer: Buffer.from('x') });

    expect(knowledgeMock.uploadFile).toHaveBeenCalledWith({ name: 'catálogo.pdf', mimeType: 'application/pdf', bytes: expect.any(Buffer) });
  });

  it('uploadFile sin archivo responde 400 y no llama a Rag-API', () => {
    expect(() => controller.uploadFile(undefined)).toThrow(BadRequestException);
    expect(knowledgeMock.uploadFile).not.toHaveBeenCalled();
  });
});
