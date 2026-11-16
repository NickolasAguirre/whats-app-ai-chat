import { ServiceUnavailableException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { ContainerIdentityService, RENEW_MARGIN_MS } from './container-identity.service.js';

describe('ContainerIdentityService', () => {
  const httpMock = { get: vi.fn(), post: vi.fn() };
  const settings: Record<string, string | undefined> = {
    CONTAINER_API_URL: 'http://container:3000/',
    CONTAINER_CLIENT_ID: 'bot-acme',
    CONTAINER_CLIENT_SECRET: 'super-secreto',
  };
  const configMock = { get: (key: string) => settings[key] };
  let service: ContainerIdentityService;
  const token = (accessToken: string, expiresIn = 3600) => of({ data: { accessToken, expiresIn } });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    service = new ContainerIdentityService(httpMock as never, configMock as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('getTenantCode', () => {
    it('lee GET /tenant (sin barra final duplicada) y cachea el code', async () => {
      httpMock.get.mockReturnValue(of({ data: { code: 'acme-7k3m9x2q', companyName: 'Acme' } }));

      expect(await service.getTenantCode()).toBe('acme-7k3m9x2q');
      expect(await service.getTenantCode()).toBe('acme-7k3m9x2q');

      expect(httpMock.get).toHaveBeenCalledTimes(1);
      expect(httpMock.get).toHaveBeenCalledWith('http://container:3000/tenant', { timeout: 3000 });
    });

    it('llamadas simultáneas comparten una sola petición', async () => {
      httpMock.get.mockReturnValue(of({ data: { code: 'acme' } }));

      const results = await Promise.all([service.getTenantCode(), service.getTenantCode(), service.getTenantCode()]);

      expect(results).toEqual(['acme', 'acme', 'acme']);
      expect(httpMock.get).toHaveBeenCalledTimes(1);
    });

    it('si container falla lanza 503 y la siguiente llamada vuelve a intentar', async () => {
      httpMock.get.mockReturnValueOnce(throwError(() => ({ response: { status: 500 } }))).mockReturnValueOnce(of({ data: { code: 'acme' } }));

      await expect(service.getTenantCode()).rejects.toThrow(ServiceUnavailableException);
      expect(await service.getTenantCode()).toBe('acme');
    });

    it.each([{}, { code: '' }, { code: 7 }])('rechaza una respuesta sin code válido (%j)', async (data) => {
      httpMock.get.mockReturnValue(of({ data }));

      await expect(service.getTenantCode()).rejects.toThrow(ServiceUnavailableException);
    });

    it('sin CONTAINER_API_URL lanza 503 sin llamar a container', async () => {
      settings.CONTAINER_API_URL = undefined;

      await expect(service.getTenantCode()).rejects.toThrow(ServiceUnavailableException);
      expect(httpMock.get).not.toHaveBeenCalled();
      settings.CONTAINER_API_URL = 'http://container:3000/';
    });
  });

  describe('getToken', () => {
    it('canjea clientId y clientSecret y cachea el token mientras falten más de 5 minutos', async () => {
      httpMock.post.mockReturnValue(token('t1'));

      expect(await service.getToken()).toBe('t1');
      vi.advanceTimersByTime(3600_000 - RENEW_MARGIN_MS - 1000);
      expect(await service.getToken()).toBe('t1');

      expect(httpMock.post).toHaveBeenCalledTimes(1);
      expect(httpMock.post).toHaveBeenCalledWith(
        'http://container:3000/auth/service-token',
        { clientId: 'bot-acme', clientSecret: 'super-secreto' },
        { timeout: 3000 },
      );
    });

    it('renueva cuando faltan menos de 5 minutos para que expire', async () => {
      httpMock.post.mockReturnValueOnce(token('t1')).mockReturnValueOnce(token('t2'));

      expect(await service.getToken()).toBe('t1');
      vi.advanceTimersByTime(3600_000 - RENEW_MARGIN_MS + 1000);

      expect(await service.getToken()).toBe('t2');
      expect(httpMock.post).toHaveBeenCalledTimes(2);
    });

    it('cinco llamadas simultáneas con el token vencido comparten una sola petición', async () => {
      httpMock.post.mockReturnValue(token('t1'));

      const results = await Promise.all(Array.from({ length: 5 }, () => service.getToken()));

      expect(results).toEqual(['t1', 't1', 't1', 't1', 't1']);
      expect(httpMock.post).toHaveBeenCalledTimes(1);
    });

    it('si la renovación falla pero el token vigente aún no expiró, sigue usándolo', async () => {
      httpMock.post.mockReturnValueOnce(token('t1')).mockReturnValue(throwError(() => ({ response: { status: 503 } })));
      await service.getToken();
      vi.advanceTimersByTime(3600_000 - RENEW_MARGIN_MS + 1000);

      const pending = service.getToken();
      await vi.runAllTimersAsync();

      expect(await pending).toBe('t1');
    });

    it('si falla y no hay token vigente lanza 503 tras 3 intentos con esperas de 500 y 1000 ms', async () => {
      httpMock.post.mockReturnValue(throwError(() => ({ response: { status: 500 } })));

      const outcome = service.getToken().then(
        () => 'ok',
        (error) => error,
      );
      await vi.advanceTimersByTimeAsync(499);
      expect(httpMock.post).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(httpMock.post).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(999);
      expect(httpMock.post).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);

      expect(httpMock.post).toHaveBeenCalledTimes(3);
      expect(await outcome).toBeInstanceOf(ServiceUnavailableException);
    });

    it.each([
      ['sin accessToken', { expiresIn: 3600 }],
      ['accessToken vacío', { accessToken: '', expiresIn: 3600 }],
      ['sin expiresIn', { accessToken: 'x' }],
      ['expiresIn no numérico', { accessToken: 'x', expiresIn: '3600' }],
      ['expiresIn cero', { accessToken: 'x', expiresIn: 0 }],
      ['expiresIn negativo', { accessToken: 'x', expiresIn: -5 }],
    ])('descarta una respuesta %s y no la cachea', async (_name, data) => {
      httpMock.post.mockReturnValue(of({ data }));

      const outcome = service.getToken().then(
        () => 'ok',
        (error) => error,
      );
      await vi.runAllTimersAsync();

      expect(await outcome).toBeInstanceOf(ServiceUnavailableException);
      // Tras fallar hay 30 s de enfriamiento; pasado ese tiempo se vuelve a pedir (y la respuesta mala no quedó cacheada).
      vi.advanceTimersByTime(30_001);
      httpMock.post.mockReturnValue(token('bueno'));
      expect(await service.getToken()).toBe('bueno');
    });

    it.each([401, 403, 400])('no reintenta un error %s de container (credenciales mal): un solo intento', async (status) => {
      httpMock.post.mockReturnValue(throwError(() => ({ response: { status } })));

      const outcome = service.getToken().then(
        () => 'ok',
        (error) => error,
      );
      await vi.runAllTimersAsync();

      expect(await outcome).toBeInstanceOf(ServiceUnavailableException);
      expect(httpMock.post).toHaveBeenCalledTimes(1);
    });

    it('sí reintenta los errores de red (sin respuesta)', async () => {
      httpMock.post.mockReturnValue(throwError(() => ({ code: 'ETIMEDOUT' })));

      const outcome = service.getToken().then(
        () => 'ok',
        (error) => error,
      );
      await vi.runAllTimersAsync();

      expect(await outcome).toBeInstanceOf(ServiceUnavailableException);
      expect(httpMock.post).toHaveBeenCalledTimes(3);
    });

    it('una respuesta con formato inválido no se reintenta', async () => {
      httpMock.post.mockReturnValue(of({ data: { accessToken: 'x', expiresIn: 0 } }));

      const outcome = service.getToken().then(
        () => 'ok',
        (error) => error,
      );
      await vi.runAllTimersAsync();

      expect(await outcome).toBeInstanceOf(ServiceUnavailableException);
      expect(httpMock.post).toHaveBeenCalledTimes(1);
    });

    it('tras un fallo sin token vigente responde 503 al instante durante 30 s y luego vuelve a intentar', async () => {
      httpMock.post.mockReturnValue(throwError(() => ({ response: { status: 500 } })));
      const first = service.getToken().then(
        () => 'ok',
        (error) => error,
      );
      await vi.runAllTimersAsync();
      expect(await first).toBeInstanceOf(ServiceUnavailableException);
      expect(httpMock.post).toHaveBeenCalledTimes(3);

      vi.advanceTimersByTime(10_000);
      await expect(service.getToken()).rejects.toThrow(ServiceUnavailableException);
      expect(httpMock.post).toHaveBeenCalledTimes(3);

      vi.advanceTimersByTime(20_001);
      httpMock.post.mockReturnValue(token('t-nuevo'));
      expect(await service.getToken()).toBe('t-nuevo');
    });

    it('invalidateToken descarta el token en caché y el siguiente getToken pide uno nuevo', async () => {
      httpMock.post.mockReturnValueOnce(token('t1')).mockReturnValueOnce(token('t2'));
      expect(await service.getToken()).toBe('t1');

      service.invalidateToken();

      expect(await service.getToken()).toBe('t2');
      expect(httpMock.post).toHaveBeenCalledTimes(2);
    });

    it('sin credenciales de cliente lanza 503 sin llamar a container', async () => {
      settings.CONTAINER_CLIENT_SECRET = undefined;

      await expect(service.getToken()).rejects.toThrow(ServiceUnavailableException);
      expect(httpMock.post).not.toHaveBeenCalled();
      settings.CONTAINER_CLIENT_SECRET = 'super-secreto';
    });

    it('nunca registra el secreto ni el token en los logs ni en los errores', async () => {
      const warn = vi.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
      httpMock.post.mockReturnValue(
        throwError(() => ({ message: 'fallo', response: { status: 401, data: { clientSecret: 'super-secreto', accessToken: 'tok-secreto' } } })),
      );

      const outcome = service.getToken().then(
        () => 'ok',
        (error) => error as Error,
      );
      await vi.runAllTimersAsync();
      const error = (await outcome) as Error;

      const everything = JSON.stringify([warn.mock.calls, error.message]);
      expect(everything).not.toContain('super-secreto');
      expect(everything).not.toContain('tok-secreto');
    });
  });
});
