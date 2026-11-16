import { composeInstructions } from './compose-instructions.js';
import { DERIVATION_RULE } from './derivation.js';

describe('composeInstructions', () => {
  it('sin fragmentos devuelve las instrucciones seguidas de la regla de derivación', () => {
    expect(composeInstructions('Sé formal.', undefined)).toBe(`Sé formal.\n\n${DERIVATION_RULE}`);
    expect(composeInstructions('Sé formal.', [])).toBe(`Sé formal.\n\n${DERIVATION_RULE}`);
  });

  it('sin instrucciones ni fragmentos devuelve solo la regla de derivación', () => {
    expect(composeInstructions(undefined, [])).toBe(DERIVATION_RULE);
  });

  it('con fragmentos agrega cada uno numerado y pide no inventar datos, y la regla va al final', () => {
    const result = composeInstructions('Sé formal.', ['Abrimos de 9 a 18 h.', 'Envíos los lunes.']);

    expect(result).toContain('Sé formal.');
    expect(result).toContain('[1] Abrimos de 9 a 18 h.');
    expect(result).toContain('[2] Envíos los lunes.');
    expect(result).toContain('no inventes datos');
    expect(result.endsWith(DERIVATION_RULE)).toBe(true);
  });

  it('sin instrucciones base devuelve el bloque de conocimiento y la regla', () => {
    const result = composeInstructions(undefined, ['Dato']);

    expect(result).toContain('[1] Dato');
    expect(result).toContain('[[CASO:');
  });
});
