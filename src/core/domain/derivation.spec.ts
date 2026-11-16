import { DEFAULT_CASE_SUMMARY, DEFAULT_DERIVATION_REPLY, MAX_CASE_SUMMARY_LENGTH, extractDerivation } from './derivation.js';

describe('extractDerivation', () => {
  it('una respuesta sin marca queda igual y no trae resumen', () => {
    expect(extractDerivation('Atendemos de 8 a 18 h.')).toEqual({ text: 'Atendemos de 8 a 18 h.' });
  });

  it('quita la marca y devuelve el resumen', () => {
    expect(extractDerivation('Te paso con una persona. [[CASO: Cambio de dirección]]')).toEqual({
      text: 'Te paso con una persona.',
      caseSummary: 'Cambio de dirección',
    });
  });

  it('acepta la marca sin resumen, en minúsculas y en medio del texto', () => {
    expect(extractDerivation('Hola [[caso]] gracias')).toMatchObject({ caseSummary: DEFAULT_CASE_SUMMARY });
    expect(extractDerivation('Hola [[caso: algo]] gracias').text).toBe('Hola  gracias');
  });

  it('si solo hay marca, el texto para el cliente es el aviso por defecto', () => {
    expect(extractDerivation('[[CASO: Reclamo]]')).toEqual({ text: DEFAULT_DERIVATION_REPLY, caseSummary: 'Reclamo' });
  });

  it('con varias marcas usa el primer resumen y quita todas', () => {
    const result = extractDerivation('Uno [[CASO: primero]] dos [[CASO: segundo]]');

    expect(result.caseSummary).toBe('primero');
    expect(result.text).not.toContain('[[');
  });

  it('el resumen puede contener corchetes sueltos sin dejar restos de la marca para el cliente', () => {
    const result = extractDerivation('Te paso con alguien. [[CASO: Pidió ver [1] y el 2]]');

    expect(result).toEqual({ text: 'Te paso con alguien.', caseSummary: 'Pidió ver [1] y el 2' });
  });

  it('acepta un resumen con saltos de línea', () => {
    expect(extractDerivation('Hola [[CASO: línea uno\nlínea dos]]').caseSummary).toBe('línea uno\nlínea dos');
  });

  it('recorta el resumen al máximo permitido', () => {
    const result = extractDerivation(`Texto [[CASO: ${'a'.repeat(900)}]]`);

    expect(result.caseSummary).toHaveLength(MAX_CASE_SUMMARY_LENGTH);
  });
});
