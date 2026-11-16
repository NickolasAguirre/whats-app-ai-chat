import { EnvNumbersService } from './env-numbers.service.js';

function serviceWith(env: Record<string, string | undefined>) {
    return new EnvNumbersService({ get: (key: string) => env[key] } as never);
}

describe('EnvNumbersService', () => {
    it('sin WHATSAPP_PHONE_NUMBER no hay números', () => {
        const service = serviceWith({});

        expect(service.list()).toEqual([]);
        expect(service.get('default')).toBeNull();
    });

    it('arma el único número desde el entorno, con etiqueta por defecto', () => {
        const service = serviceWith({ WHATSAPP_PHONE_NUMBER: ' +57 300 123 4567 ', WHATSAPP_WABA_ID: 'waba-1' });

        expect(service.list()).toEqual([
            { id: 'default', phoneNumber: '+57 300 123 4567', wabaId: 'waba-1', label: 'Número principal', active: true },
        ]);
        expect(service.get('default')?.phoneNumber).toBe('+57 300 123 4567');
        expect(service.get('otro')).toBeNull();
    });

    it('usa la etiqueta configurada', () => {
        const service = serviceWith({ WHATSAPP_PHONE_NUMBER: '+57300', WHATSAPP_NUMBER_LABEL: 'Ventas' });

        expect(service.list()[0].label).toBe('Ventas');
    });
});
