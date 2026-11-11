import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AdminInstructionsController } from './admin-instructions.controller.js';
import { SaveInstructionsDto } from './dto/save-instructions.dto.js';

describe('AdminInstructionsController', () => {
  const serviceMock = { getEffective: vi.fn(), save: vi.fn(), reset: vi.fn() };
  const controller = new AdminInstructionsController(serviceMock as never);
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const validate = (body: unknown) => pipe.transform(body, { type: 'body', metatype: SaveInstructionsDto });
  const messagesOf = async (body: unknown): Promise<string[]> => {
    const error = await validate(body).catch((failure: BadRequestException) => failure);
    return (error as BadRequestException).getResponse() ? ((error as BadRequestException).getResponse() as { message: string[] }).message : [];
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('get, save y reset delegan en el servicio', async () => {
    serviceMock.getEffective.mockResolvedValue({ content: 'x', updatedAt: null, isDefault: true });
    serviceMock.save.mockResolvedValue({ content: 'y', updatedAt: new Date(), isDefault: false });

    expect(await controller.get()).toMatchObject({ isDefault: true });
    expect(await controller.save({ content: 'y' })).toMatchObject({ content: 'y' });
    await controller.reset();

    expect(serviceMock.save).toHaveBeenCalledWith('y');
    expect(serviceMock.reset).toHaveBeenCalled();
  });

  it('el DTO rechaza contenido vacío o ausente con un mensaje en español', async () => {
    await expect(validate({ content: '' })).rejects.toThrow(BadRequestException);
    await expect(validate({})).rejects.toThrow(BadRequestException);
    expect(await messagesOf({ content: '' })).toContain('Las instrucciones no pueden estar vacías.');
  });

  it('el DTO acepta 8000 caracteres y rechaza 8001', async () => {
    await expect(validate({ content: 'a'.repeat(8000) })).resolves.toMatchObject({ content: 'a'.repeat(8000) });
    expect(await messagesOf({ content: 'a'.repeat(8001) })).toContain('Las instrucciones no pueden superar los 8000 caracteres.');
  });

  it('el DTO descarta campos desconocidos', async () => {
    const result = (await validate({ content: 'hola', admin: true })) as SaveInstructionsDto;

    expect(result).not.toHaveProperty('admin');
  });
});
