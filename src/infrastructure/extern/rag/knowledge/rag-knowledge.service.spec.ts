import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { RagKnowledgeService } from './rag-knowledge.service.js';

describe('RagKnowledgeService', () => {
  const httpMock = { request: vi.fn() };
  const settings: Record<string, string | undefined> = {
    RAG_API_URL: 'http://rag:3100',
  };
  const configMock = { get: (key: string) => settings[key] };
  const tokenMock = { getToken: vi.fn(), invalidateToken: vi.fn() };
  const service = new RagKnowledgeService(httpMock as never, configMock as never, tokenMock as never);
  const ragDocument = {
    id: 'd1',
    kind: 'pdf',
    title: 'catálogo.pdf',
    status: 'failed',
    createdAt: '2026-11-09T10:00:00.000Z',
    sizeBytes: 5,
    errorMessage: 'El PDF está dañado o no se puede abrir.',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    tokenMock.getToken.mockResolvedValue('jwt-de-servicio');
    delete settings.KNOWLEDGE_TOP_K;
    delete settings.KNOWLEDGE_MIN_SCORE;
  });

  it('list pide los documentos de la colección con el token de servicio y los convierte a KnowledgeItem', async () => {
    httpMock.request.mockReturnValue(of({ data: [ragDocument] }));

    const [item] = await service.list();

    expect(httpMock.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'http://rag:3100/collections/qwen/documents',
        headers: expect.objectContaining({ Authorization: 'Bearer jwt-de-servicio' }),
      }),
    );
    expect(item).toEqual({
      id: 'd1',
      kind: 'pdf',
      title: 'catálogo.pdf',
      status: 'failed',
      createdAt: new Date('2026-11-09T10:00:00.000Z'),
      sizeBytes: 5,
      content: undefined,
      errorMessage: 'El PDF está dañado o no se puede abrir.',
    });
  });

  it('createNote, updateNote y remove usan las rutas de documentos de Rag-API', async () => {
    httpMock.request.mockReturnValue(of({ data: ragDocument }));

    await service.createNote({ title: 't', content: 'c' });
    await service.updateNote('d1', { title: 't2', content: 'c2' });
    await service.remove('d1');

    expect(httpMock.request.mock.calls.map(([options]) => [options.method, options.url])).toEqual([
      ['POST', 'http://rag:3100/collections/qwen/documents/text'],
      ['PUT', 'http://rag:3100/collections/qwen/documents/d1/text'],
      ['DELETE', 'http://rag:3100/collections/qwen/documents/d1'],
    ]);
  });

  it('uploadFile manda el archivo como multipart con su nombre original', async () => {
    httpMock.request.mockReturnValue(of({ data: ragDocument }));

    await service.uploadFile({ name: 'catálogo.pdf', mimeType: 'application/pdf', bytes: Buffer.from('pdf') });

    const { data, method } = httpMock.request.mock.calls[0][0];
    expect(method).toBe('POST');
    expect(data).toBeInstanceOf(FormData);
    expect((data as FormData).get('file')).toMatchObject({ name: 'catálogo.pdf' });
  });

  describe('search', () => {
    it('pide topK = 4 y descarta los puntajes menores a 0.35', async () => {
      httpMock.request.mockReturnValue(
        of({
          data: {
            results: [
              { text: 'muy parecido', score: 0.9 },
              { text: 'justo en el límite', score: 0.35 },
              { text: 'poco parecido', score: 0.34 },
            ],
          },
        }),
      );

      const result = await service.search('horarios');

      expect(result).toEqual(['muy parecido', 'justo en el límite']);
      expect(httpMock.request).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', url: 'http://rag:3100/collections/qwen/search', data: { query: 'horarios', topK: 4 } }),
      );
    });

    it('respeta KNOWLEDGE_TOP_K y KNOWLEDGE_MIN_SCORE del entorno', async () => {
      settings.KNOWLEDGE_TOP_K = '2';
      settings.KNOWLEDGE_MIN_SCORE = '0.8';
      httpMock.request.mockReturnValue(of({ data: { results: [{ text: 'a', score: 0.9 }, { text: 'b', score: 0.5 }] } }));

      expect(await service.search('x')).toEqual(['a']);
      expect(httpMock.request).toHaveBeenCalledWith(expect.objectContaining({ data: { query: 'x', topK: 2 } }));
    });
  });

  it('no envía X-API-Key ni X-Tenant-Id y usa siempre la colección qwen', async () => {
    settings.RAG_COLLECTION = 'otra';
    httpMock.request.mockReturnValue(of({ data: [] }));

    await service.list();

    const [options] = httpMock.request.mock.calls[0];
    expect(options.url).toBe('http://rag:3100/collections/qwen/documents');
    expect(options.headers).not.toHaveProperty('X-API-Key');
    expect(options.headers).not.toHaveProperty('X-Tenant-Id');
    delete settings.RAG_COLLECTION;
  });

  it('pide el token de servicio en cada llamada (el puerto se encarga de cachearlo)', async () => {
    httpMock.request.mockReturnValue(of({ data: [] }));

    await service.list();
    await service.list();

    expect(tokenMock.getToken).toHaveBeenCalledTimes(2);
  });

  it('si no hay token de servicio rechaza con 503 y no llama a Rag-API', async () => {
    tokenMock.getToken.mockRejectedValue(new ServiceUnavailableException('sin token'));

    await expect(service.list()).rejects.toThrow(ServiceUnavailableException);
    expect(httpMock.request).not.toHaveBeenCalled();
  });

  it('pone un tope de tiempo a cada petición a Rag-API', async () => {
    httpMock.request.mockReturnValue(of({ data: [] }));

    await service.list();

    expect(httpMock.request).toHaveBeenCalledWith(expect.objectContaining({ timeout: 10000 }));
  });

  it('ante un 401 invalida el token, reintenta una vez con el nuevo y devuelve el resultado', async () => {
    tokenMock.getToken.mockResolvedValueOnce('viejo').mockResolvedValueOnce('nuevo');
    httpMock.request
      .mockReturnValueOnce(throwError(() => ({ response: { status: 401, data: { message: 'Unauthorized' } } })))
      .mockReturnValueOnce(of({ data: [ragDocument] }));

    const items = await service.list();

    expect(tokenMock.invalidateToken).toHaveBeenCalledTimes(1);
    expect(httpMock.request).toHaveBeenCalledTimes(2);
    expect(httpMock.request.mock.calls[1][0].headers.Authorization).toBe('Bearer nuevo');
    expect(items).toHaveLength(1);
  });

  it('si Rag-API rechaza también el token nuevo responde 503 (nunca 401: el panel cerraría la sesión del usuario)', async () => {
    httpMock.request.mockReturnValue(throwError(() => ({ response: { status: 401, data: { message: 'Unauthorized' } } })));

    const failure = await service.list().catch((error) => error);

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect(httpMock.request).toHaveBeenCalledTimes(2);
  });

  it('un 403 de Rag-API no dispara la invalidación del token', async () => {
    httpMock.request.mockReturnValue(throwError(() => ({ response: { status: 403, data: { message: 'Forbidden' } } })));

    const failure = await service.list().catch((error) => error);

    expect(failure.getStatus()).toBe(403);
    expect(tokenMock.invalidateToken).not.toHaveBeenCalled();
  });

  describe('errores', () => {
    it('conserva el código y el mensaje (en español) de los errores 4xx de Rag-API', async () => {
      httpMock.request.mockReturnValue(throwError(() => ({ response: { status: 413, data: { message: 'El archivo supera el máximo de 10 MB.' } } })));

      const failure = await service.remove('d1').catch((error) => error);

      expect(failure).toBeInstanceOf(HttpException);
      expect(failure.getStatus()).toBe(413);
      expect(failure.message).toBe('El archivo supera el máximo de 10 MB.');
    });

    it('si Rag-API no responde, lanza 503 con un mensaje claro', async () => {
      httpMock.request.mockReturnValue(throwError(() => new Error('connect ECONNREFUSED')));

      await expect(service.list()).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
