import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BotNumber, NumbersPort } from '../../../core/domain/ports/numbers-port/numbers.port.js';

export const DEFAULT_NUMBER_ID = 'default';

/**
 * Un despliegue = un número de WhatsApp (ver la decisión del 2026-11-09), así que el número sale del entorno:
 * `WHATSAPP_PHONE_NUMBER`, `WHATSAPP_NUMBER_LABEL` y `WHATSAPP_WABA_ID`. Sin `WHATSAPP_PHONE_NUMBER` no hay números.
 */
@Injectable()
export class EnvNumbersService implements NumbersPort {
    constructor(private readonly config: ConfigService) {}

    list(): BotNumber[] {
        const phoneNumber = this.config.get<string>('WHATSAPP_PHONE_NUMBER')?.trim();
        if (!phoneNumber) {
            return [];
        }

        return [
            {
                id: DEFAULT_NUMBER_ID,
                phoneNumber,
                wabaId: this.config.get<string>('WHATSAPP_WABA_ID')?.trim() ?? '',
                label: this.config.get<string>('WHATSAPP_NUMBER_LABEL')?.trim() || 'Número principal',
                active: true,
            },
        ];
    }

    get(id: string): BotNumber | null {
        return this.list().find((number) => number.id === id) ?? null;
    }
}
