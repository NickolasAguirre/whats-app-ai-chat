export interface BotNumber {
    id: string;
    phoneNumber: string;
    wabaId: string;
    label: string;
    active: boolean;
}

/** Números de WhatsApp con los que atiende este despliegue (hoy uno solo, definido en el entorno). */
export abstract class NumbersPort {
    abstract list(): BotNumber[];
    abstract get(id: string): BotNumber | null;
}
