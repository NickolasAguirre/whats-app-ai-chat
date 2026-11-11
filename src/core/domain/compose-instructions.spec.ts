import { composeInstructions } from './compose-instructions.js';

describe('composeInstructions', () => {
  it('sin fragmentos devuelve las instrucciones tal cual', () => {
    expect(composeInstructions('Sé formal.', undefined)).toBe('Sé formal.');
    expect(composeInstructions('Sé formal.', [])).toBe('Sé formal.');
    expect(composeInstructions(undefined, [])).toBeUndefined();
  });

  it('con fragmentos agrega cada uno numerado y pide no inventar datos', () => {
    const result = composeInstructions('Sé formal.', ['Abrimos de 9 a 18 h.', 'Envíos los lunes.']);

    expect(result).toContain('Sé formal.');
    expect(result).toContain('[1] Abrimos de 9 a 18 h.');
    expect(result).toContain('[2] Envíos los lunes.');
    expect(result).toContain('no inventes datos');
  });

  it('sin instrucciones base devuelve solo el bloque de conocimiento', () => {
    expect(composeInstructions(undefined, ['Dato'])).toContain('[1] Dato');
  });
});
