const KNOWLEDGE_HEADER =
    'Información del negocio (úsala para responder; si la respuesta no está en ella, no inventes datos):';

/** Une las instrucciones del bot con los fragmentos de conocimiento encontrados para el mensaje actual. */
export function composeInstructions(base: string | undefined, knowledge: string[] | undefined): string | undefined {
    if (!knowledge || knowledge.length === 0) {
        return base;
    }

    const block = [KNOWLEDGE_HEADER, ...knowledge.map((fragment, index) => `[${index + 1}] ${fragment}`)].join('\n\n');
    return base ? `${base}\n\n${block}` : block;
}
