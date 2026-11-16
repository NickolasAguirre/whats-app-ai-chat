import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import 'reflect-metadata';
import { AdminPeopleController } from './admin-people.controller.js';
import { TenantMatchGuard } from './guards/tenant-match.guard.js';
import { MessagesQueryDto } from './dto/messages-query.dto.js';

const PERSON_ID = '11111111-1111-4111-8111-111111111111';

describe('AdminPeopleController', () => {
    const port = { listPeople: vi.fn(), getPerson: vi.fn(), listMessages: vi.fn() };
    const controller = new AdminPeopleController(port as never);
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const parseQuery = (query: unknown) => pipe.transform(query, { type: 'query', metatype: MessagesQueryDto }) as Promise<MessagesQueryDto>;

    const person = { id: PERSON_ID, phoneNumber: '+57300', name: null, lastMessageAt: new Date('2026-11-15T10:00:00Z'), lastMessagePreview: 'hola' };
    const stored = (id: string, minute: number, role: 'inbound' | 'outbound' = 'inbound') => ({
        id,
        personId: PERSON_ID,
        role,
        text: `m${id}`,
        timestamp: new Date(Date.UTC(2026, 10, 15, 10, minute)),
    });

    beforeEach(() => {
        vi.resetAllMocks();
        port.getPerson.mockResolvedValue(person);
    });

    it('lista personas con fechas ISO y sin nombre nulo', async () => {
        port.listPeople.mockResolvedValue([person]);

        const result = await controller.list('maria');

        expect(port.listPeople).toHaveBeenCalledWith('maria');
        expect(result).toEqual([
            { id: PERSON_ID, phoneNumber: '+57300', name: undefined, lastMessageAt: '2026-11-15T10:00:00.000Z', lastMessagePreview: 'hola' },
        ]);
    });

    it('responde 404 si la persona no existe', async () => {
        port.getPerson.mockResolvedValue(null);

        await expect(controller.get(PERSON_ID)).rejects.toThrow(NotFoundException);
        await expect(controller.messages(PERSON_ID, {})).rejects.toThrow(NotFoundException);
    });

    it('devuelve los mensajes con el rol del panel y un cursor que apunta al más antiguo', async () => {
        port.listMessages.mockResolvedValue({ items: [stored('b', 2, 'outbound'), stored('a', 1)], hasMore: true });

        const page = await controller.messages(PERSON_ID, { limit: 2 });

        expect(page.items.map((item) => item.role)).toEqual(['assistant', 'user']);
        expect(page.hasMore).toBe(true);
        expect(JSON.parse(Buffer.from(page.nextCursor as string, 'base64url').toString())).toEqual({
            t: '2026-11-15T10:01:00.000Z',
            id: 'a',
        });
    });

    it('usa 30 mensajes por página por defecto y no devuelve cursor si la página está vacía', async () => {
        port.listMessages.mockResolvedValue({ items: [], hasMore: false });

        const page = await controller.messages(PERSON_ID, {});

        expect(port.listMessages).toHaveBeenCalledWith(PERSON_ID, expect.objectContaining({ limit: 30 }));
        expect(page).toEqual({ items: [], nextCursor: null, hasMore: false });
    });

    it('el cursor recibido llega al puerto como fecha e id', async () => {
        port.listMessages.mockResolvedValue({ items: [], hasMore: false });
        const cursor = Buffer.from(JSON.stringify({ t: '2026-11-15T10:01:00.000Z', id: PERSON_ID })).toString('base64url');

        await controller.messages(PERSON_ID, { before: cursor });

        expect(port.listMessages).toHaveBeenCalledWith(
            PERSON_ID,
            expect.objectContaining({ before: { createdAt: new Date('2026-11-15T10:01:00.000Z'), id: PERSON_ID } }),
        );
    });

    it('rechaza un cursor inválido y un rango con from posterior a to', async () => {
        await expect(controller.messages(PERSON_ID, { before: 'no-es-un-cursor' })).rejects.toThrow(BadRequestException);
        await expect(
            controller.messages(PERSON_ID, { from: '2026-11-16T00:00:00Z', to: '2026-11-15T00:00:00Z' }),
        ).rejects.toThrow(BadRequestException);
    });

    it('rechaza un cursor cuyo id no es uuid antes de llegar a la base de datos', async () => {
        const cursor = Buffer.from(JSON.stringify({ t: '2026-11-15T10:01:00.000Z', id: "x'; DROP" })).toString('base64url');

        await expect(controller.messages(PERSON_ID, { before: cursor })).rejects.toThrow(BadRequestException);
        expect(port.listMessages).not.toHaveBeenCalled();
    });

    it('ignora un search repetido (arreglo) en lugar de fallar', async () => {
        port.listPeople.mockResolvedValue([]);

        await controller.list(['a', 'b']);

        expect(port.listPeople).toHaveBeenCalledWith(undefined);
    });

    it('protege las rutas con TenantMatchGuard y valida la entrada con ValidationPipe', () => {
        const guards = Reflect.getMetadata('__guards__', AdminPeopleController) as unknown[];
        const pipes = Reflect.getMetadata('__pipes__', AdminPeopleController) as unknown[];

        expect(guards).toContain(TenantMatchGuard);
        expect(pipes.some((candidate) => candidate instanceof ValidationPipe)).toBe(true);
    });

    it('el DTO rechaza fechas inexistentes aunque tengan formato ISO', async () => {
        await expect(parseQuery({ from: '2026-02-30T00:00:00Z' })).rejects.toThrow(BadRequestException);
    });

    it('el DTO valida fechas ISO y el tamaño de página, y convierte limit a número', async () => {
        await expect(parseQuery({ from: 'ayer' })).rejects.toThrow(BadRequestException);
        await expect(parseQuery({ limit: '0' })).rejects.toThrow(BadRequestException);
        await expect(parseQuery({ limit: '101' })).rejects.toThrow(BadRequestException);
        await expect(parseQuery({ limit: '30', from: '2026-11-15T00:00:00.000Z' })).resolves.toMatchObject({ limit: 30 });
    });
});
