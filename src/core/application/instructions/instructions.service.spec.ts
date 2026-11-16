import { InstructionsService } from './instructions.service.js';
import { DEFAULT_INSTRUCTIONS } from '../../domain/default-instructions.js';

describe('InstructionsService', () => {
  const repositoryMock = { get: vi.fn(), save: vi.fn(), delete: vi.fn() };
  const service = new InstructionsService(repositoryMock);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('getEffective devuelve el comportamiento por defecto (claro, formal, en español) si no hay instrucciones guardadas', async () => {
    repositoryMock.get.mockResolvedValue(null);

    const result = await service.getEffective();

    expect(result).toEqual({ content: DEFAULT_INSTRUCTIONS, updatedAt: null, isDefault: true });
    expect(DEFAULT_INSTRUCTIONS).toContain('español');
    expect(DEFAULT_INSTRUCTIONS).toContain('formal');
  });

  it('getEffective devuelve las instrucciones del cliente cuando existen', async () => {
    const updatedAt = new Date('2026-11-09T10:00:00Z');
    repositoryMock.get.mockResolvedValue({ id: 'i1', content: 'Habla como pirata', updatedAt });

    expect(await service.getEffective()).toEqual({ content: 'Habla como pirata', updatedAt, isDefault: false });
  });

  it('save guarda y devuelve las instrucciones como no por defecto', async () => {
    const updatedAt = new Date();
    repositoryMock.save.mockResolvedValue({ id: 'i1', content: 'Nuevo', updatedAt });

    expect(await service.save('Nuevo')).toEqual({ content: 'Nuevo', updatedAt, isDefault: false });
    expect(repositoryMock.save).toHaveBeenCalledWith('Nuevo');
  });

  it('reset borra las instrucciones guardadas', async () => {
    await service.reset();

    expect(repositoryMock.delete).toHaveBeenCalled();
  });
});
