/** Regla que se agrega siempre a las instrucciones: así el cliente no puede quitar la derivación editándolas. */
export const DERIVATION_RULE =
    'Si no puedes resolver la consulta con la información disponible o el cliente necesita a una persona, ' +
    'responde con un mensaje breve y amable para el cliente y termina con la marca [[CASO: resumen de lo que necesita]]. ' +
    'Usa la marca solo en ese caso; el cliente no la verá.';

export const DEFAULT_DERIVATION_REPLY = 'Una persona de nuestro equipo te contactará para ayudarte con tu consulta.';
export const DEFAULT_CASE_SUMMARY = 'El asistente no pudo resolver la consulta.';
export const MAX_CASE_SUMMARY_LENGTH = 500;

// El resumen puede contener "]"; termina en el primer "]]".
const MARKER = /\[\[CASO(?::((?:(?!\]\]).)*))?\]\]/gis;

export interface DerivationResult {
    /** Texto para el cliente, sin la marca. */
    text: string;
    /** Resumen del caso si la respuesta traía la marca; `undefined` si no. */
    caseSummary?: string;
}

/** Quita la marca `[[CASO: resumen]]` de la respuesta del LLM y devuelve el resumen para abrir el caso. */
export function extractDerivation(reply: string): DerivationResult {
    let summary: string | undefined;
    let found = false;

    const stripped = reply.replace(MARKER, (_match, captured?: string) => {
        if (!found) {
            summary = captured?.trim();
        }
        found = true;
        return '';
    });

    if (!found) {
        return { text: reply };
    }

    return {
        text: stripped.trim() || DEFAULT_DERIVATION_REPLY,
        caseSummary: (summary || DEFAULT_CASE_SUMMARY).slice(0, MAX_CASE_SUMMARY_LENGTH),
    };
}
