import { DERIVATION_RULE } from './derivation.js';

const KNOWLEDGE_HEADER =
    'Información del negocio (úsala para responder; si la respuesta no está en ella, no inventes datos):';

/**
 * Une las instrucciones del bot con los fragmentos de conocimiento encontrados para el mensaje actual y, al final,
 * la regla de derivación (siempre presente, no depende de lo que el cliente haya escrito en las instrucciones).
 */
export function composeInstructions(base: string | undefined, knowledge: string[] | undefined): string {
    const parts: string[] = [];
    if (base) {
        parts.push(base);
    }
    if (knowledge && knowledge.length > 0) {
        parts.push([KNOWLEDGE_HEADER, ...knowledge.map((fragment, index) => `[${index + 1}] ${fragment}`)].join('\n\n'));
    }
    parts.push(DERIVATION_RULE);
    return parts.join('\n\n');
}
