import 'reflect-metadata';
import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { AdminNumbersController } from './admin-numbers.controller.js';
import { AdminStatsController } from './admin-stats.controller.js';
import { StatsQueryDto } from './dto/stats-query.dto.js';
import { TenantMatchGuard } from './guards/tenant-match.guard.js';

describe('AdminStatsController', () => {
    const stats = { getDashboard: vi.fn() };
    const controller = new AdminStatsController(stats as never);
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const parse = (query: unknown) => pipe.transform(query, { type: 'query', metatype: StatsQueryDto }) as Promise<StatsQueryDto>;

    beforeEach(() => vi.resetAllMocks());

    it('delega en el servicio con el desfase recibido o 0', async () => {
        stats.getDashboard.mockResolvedValue({ period: 'week' });

        await controller.get({ period: 'week', tzOffset: 300 });
        await controller.get({ period: 'day' });

        expect(stats.getDashboard).toHaveBeenNthCalledWith(1, 'week', 300);
        expect(stats.getDashboard).toHaveBeenNthCalledWith(2, 'day', 0);
    });

    it('el DTO acepta solo day, week o month y un desfase entero razonable', async () => {
        await expect(parse({ period: 'year' })).rejects.toThrow(BadRequestException);
        await expect(parse({})).rejects.toThrow(BadRequestException);
        await expect(parse({ period: 'day', tzOffset: '1000' })).rejects.toThrow(BadRequestException);
        await expect(parse({ period: 'day', tzOffset: '1.5' })).rejects.toThrow(BadRequestException);
        await expect(parse({ period: 'month', tzOffset: '-300' })).resolves.toMatchObject({ period: 'month', tzOffset: -300 });
    });

    it('está protegido con TenantMatchGuard y ValidationPipe', () => {
        expect(Reflect.getMetadata('__guards__', AdminStatsController)).toContain(TenantMatchGuard);
        const pipes = Reflect.getMetadata('__pipes__', AdminStatsController) as unknown[];
        expect(pipes.some((candidate) => candidate instanceof ValidationPipe)).toBe(true);
    });
});

describe('AdminNumbersController', () => {
    const numbers = { list: vi.fn(), get: vi.fn() };
    const controller = new AdminNumbersController(numbers as never);

    beforeEach(() => vi.resetAllMocks());

    it('lista los números y devuelve uno por id', () => {
        const number = { id: 'default', phoneNumber: '+57300', wabaId: '', label: 'Ventas', active: true };
        numbers.list.mockReturnValue([number]);
        numbers.get.mockReturnValue(number);

        expect(controller.list()).toEqual([number]);
        expect(controller.get('default')).toBe(number);
    });

    it('responde 404 si el número no existe', () => {
        numbers.get.mockReturnValue(null);

        expect(() => controller.get('nope')).toThrow(NotFoundException);
    });

    it('está protegido con TenantMatchGuard', () => {
        expect(Reflect.getMetadata('__guards__', AdminNumbersController)).toContain(TenantMatchGuard);
    });
});
