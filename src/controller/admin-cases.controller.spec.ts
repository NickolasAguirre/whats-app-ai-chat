import 'reflect-metadata';
import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { AdminCasesController } from './admin-cases.controller.js';
import { CasesQueryDto, CreateCaseDto, UpdateCaseDto } from './dto/cases.dto.js';
import { TenantMatchGuard } from './guards/tenant-match.guard.js';

const CASE_ID = '22222222-2222-4222-8222-222222222222';
const PERSON_ID = '11111111-1111-4111-8111-111111111111';

const record = {
    id: CASE_ID,
    personId: PERSON_ID,
    personName: null,
    personPhone: '+57300',
    summary: 'Pedido',
    status: 'open' as const,
    source: 'ai' as const,
    assignee: null,
    note: null,
    createdAt: new Date('2026-11-15T10:00:00Z'),
    updatedAt: new Date('2026-11-15T10:00:00Z'),
    resolvedAt: null,
};

describe('AdminCasesController', () => {
    const service = { list: vi.fn(), get: vi.fn(), registerManual: vi.fn(), update: vi.fn() };
    const controller = new AdminCasesController(service as never);
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const parse = <T>(type: 'query' | 'body', metatype: new () => T, value: unknown) =>
        pipe.transform(value, { type, metatype }) as Promise<T>;

    beforeEach(() => vi.resetAllMocks());

    it('lista los casos con fechas ISO y sin nulos, filtrando por estado', async () => {
        service.list.mockResolvedValue([record]);

        const result = await controller.list({ status: 'open' });

        expect(service.list).toHaveBeenCalledWith('open');
        expect(result[0]).toMatchObject({ id: CASE_ID, createdAt: '2026-11-15T10:00:00.000Z', resolvedAt: null, personName: undefined });
    });

    it('responde 404 si el caso o la persona no existen', async () => {
        service.get.mockResolvedValue(null);
        service.registerManual.mockResolvedValue(null);
        service.update.mockResolvedValue(null);

        await expect(controller.get(CASE_ID)).rejects.toThrow(NotFoundException);
        await expect(controller.create({ personId: PERSON_ID, summary: 'x' })).rejects.toThrow(NotFoundException);
        await expect(controller.update(CASE_ID, { status: 'resolved' })).rejects.toThrow(NotFoundException);
    });

    it('create recorta el resumen y update pasa solo lo recibido', async () => {
        service.registerManual.mockResolvedValue(record);
        service.update.mockResolvedValue({ ...record, status: 'resolved' });

        await controller.create({ personId: PERSON_ID, summary: '  Pedido  ' });
        const updated = await controller.update(CASE_ID, { status: 'resolved', note: 'Listo' });

        expect(service.registerManual).toHaveBeenCalledWith(PERSON_ID, 'Pedido');
        expect(service.update).toHaveBeenCalledWith(CASE_ID, { status: 'resolved', note: 'Listo', assignee: undefined });
        expect(updated.status).toBe('resolved');
    });

    it('los DTO validan estado, persona, resumen y largos', async () => {
        await expect(parse('query', CasesQueryDto, { status: 'closed' })).rejects.toThrow(BadRequestException);
        await expect(parse('query', CasesQueryDto, {})).resolves.toBeDefined();
        await expect(parse('body', CreateCaseDto, { personId: 'no-uuid', summary: 'x' })).rejects.toThrow(BadRequestException);
        await expect(parse('body', CreateCaseDto, { personId: PERSON_ID, summary: '' })).rejects.toThrow(BadRequestException);
        await expect(parse('body', CreateCaseDto, { personId: PERSON_ID, summary: 'a'.repeat(501) })).rejects.toThrow(BadRequestException);
        await expect(parse('body', UpdateCaseDto, { note: 'a'.repeat(2001) })).rejects.toThrow(BadRequestException);
        await expect(parse('body', UpdateCaseDto, { assignee: 'a'.repeat(101) })).rejects.toThrow(BadRequestException);
        await expect(parse('body', UpdateCaseDto, { note: '', assignee: '' })).resolves.toMatchObject({ note: '', assignee: '' });
    });

    it('el PATCH rechaza null en vez de dejarlo llegar a la base de datos', async () => {
        await expect(parse('body', UpdateCaseDto, { status: null })).rejects.toThrow(BadRequestException);
        await expect(parse('body', UpdateCaseDto, { note: null })).rejects.toThrow(BadRequestException);
        await expect(parse('body', UpdateCaseDto, { assignee: null })).rejects.toThrow(BadRequestException);
    });

    it('un resumen de solo espacios se rechaza y uno con espacios se recorta', async () => {
        await expect(parse('body', CreateCaseDto, { personId: PERSON_ID, summary: '    ' })).rejects.toThrow(BadRequestException);
        await expect(parse('body', CreateCaseDto, { personId: PERSON_ID, summary: '  Pedido  ' })).resolves.toMatchObject({ summary: 'Pedido' });
    });

    it('está protegido con TenantMatchGuard y ValidationPipe', () => {
        expect(Reflect.getMetadata('__guards__', AdminCasesController)).toContain(TenantMatchGuard);
        const pipes = Reflect.getMetadata('__pipes__', AdminCasesController) as unknown[];
        expect(pipes.some((candidate) => candidate instanceof ValidationPipe)).toBe(true);
    });
});
