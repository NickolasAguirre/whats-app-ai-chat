import { CasesService } from './cases.service.js';

describe('CasesService', () => {
    const port = { create: vi.fn(), hasActiveCase: vi.fn(), list: vi.fn(), get: vi.fn(), update: vi.fn() };
    const service = new CasesService(port as never);

    beforeEach(() => vi.resetAllMocks());

    it('openFromAi crea un caso con origen ai si la persona no tiene uno activo', async () => {
        port.hasActiveCase.mockResolvedValue(false);
        port.create.mockResolvedValue({ id: 'c1' });

        expect(await service.openFromAi('p1', 'resumen')).toEqual({ id: 'c1' });
        expect(port.create).toHaveBeenCalledWith({ personId: 'p1', summary: 'resumen', source: 'ai' });
    });

    it('openFromAi no abre un segundo caso mientras haya uno abierto o en curso', async () => {
        port.hasActiveCase.mockResolvedValue(true);

        expect(await service.openFromAi('p1', 'resumen')).toBeNull();
        expect(port.create).not.toHaveBeenCalled();
    });

    it('registerManual crea con origen manual aunque exista un caso activo', async () => {
        port.create.mockResolvedValue({ id: 'c2' });

        await service.registerManual('p1', 'a mano');

        expect(port.hasActiveCase).not.toHaveBeenCalled();
        expect(port.create).toHaveBeenCalledWith({ personId: 'p1', summary: 'a mano', source: 'manual' });
    });

    it('list, get y update delegan en el puerto', async () => {
        port.list.mockResolvedValue([]);
        port.get.mockResolvedValue(null);
        port.update.mockResolvedValue({ id: 'c1' });

        await service.list('open');
        await service.get('c1');
        await service.update('c1', { status: 'resolved' });

        expect(port.list).toHaveBeenCalledWith('open');
        expect(port.get).toHaveBeenCalledWith('c1');
        expect(port.update).toHaveBeenCalledWith('c1', { status: 'resolved' });
    });
});
