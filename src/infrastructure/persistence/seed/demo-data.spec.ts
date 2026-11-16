import { DEMO_INSTRUCTIONS, DEMO_PHONE_PREFIX, DEMO_PROVIDER_PREFIX, buildDemoData } from './demo-data.js';

describe('buildDemoData', () => {
    const now = new Date('2026-11-15T20:00:00Z');
    const data = buildDemoData(now);
    const DAY_MS = 24 * 60 * 60 * 1000;

    it('es determinista: la misma fecha da exactamente los mismos datos', () => {
        expect(buildDemoData(now)).toEqual(data);
    });

    it('todas las personas llevan el prefijo demo, con teléfonos únicos y algunas sin nombre', () => {
        const phones = data.people.map((person) => person.phoneNumber);

        expect(phones.every((phone) => phone.startsWith(DEMO_PHONE_PREFIX))).toBe(true);
        expect(new Set(phones).size).toBe(phones.length);
        expect(data.people.some((person) => person.name === null)).toBe(true);
        expect(data.people.some((person) => person.name !== null)).toBe(true);
    });

    it('los mensajes están ordenados, dentro de los últimos 30 días y nunca en el futuro', () => {
        const times = data.messages.map((message) => message.createdAt.getTime());

        expect(times).toEqual([...times].sort((a, b) => a - b));
        expect(Math.max(...times)).toBeLessThanOrEqual(now.getTime());
        expect(Math.min(...times)).toBeGreaterThan(now.getTime() - 31 * DAY_MS);
    });

    it('cada entrante tiene su respuesta y solo los entrantes llevan providerMessageId único con el prefijo demo', () => {
        const inbound = data.messages.filter((message) => message.role === 'inbound');
        const outbound = data.messages.filter((message) => message.role === 'outbound');
        const ids = inbound.map((message) => message.providerMessageId);

        expect(inbound.length).toBe(outbound.length);
        expect(ids.every((id) => id?.startsWith(DEMO_PROVIDER_PREFIX))).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
        expect(outbound.every((message) => message.providerMessageId === null)).toBe(true);
    });

    it('hay mensajes de hoy y de muchos días distintos, para que el resumen y la paginación se vean reales', () => {
        const days = new Set(data.messages.map((message) => message.createdAt.toISOString().slice(0, 10)));

        expect(data.messages.some((message) => message.createdAt.getTime() > now.getTime() - 15 * 3_600_000)).toBe(true);
        expect(days.size).toBeGreaterThan(20);
    });

    it('los casos pertenecen a personas demo y las fechas de resolución son coherentes con el estado', () => {
        const phones = new Set(data.people.map((person) => person.phoneNumber));

        expect(data.cases.length).toBeGreaterThanOrEqual(8);
        for (const item of data.cases) {
            expect(phones.has(item.phoneNumber)).toBe(true);
            expect(item.createdAt.getTime()).toBeLessThanOrEqual(now.getTime());
            expect(item.updatedAt.getTime()).toBeGreaterThanOrEqual(item.createdAt.getTime());
            if (item.status === 'resolved') {
                expect(item.resolvedAt).not.toBeNull();
                expect(item.resolvedAt!.getTime()).toBeLessThanOrEqual(now.getTime());
                expect(item.note).toBeTruthy();
            } else {
                expect(item.resolvedAt).toBeNull();
            }
        }
    });

    it('respeta el índice único: a lo sumo un caso automático activo por persona', () => {
        const active = data.cases.filter((item) => item.source === 'ai' && item.status !== 'resolved');
        const perPerson = new Map<string, number>();
        for (const item of active) perPerson.set(item.phoneNumber, (perPerson.get(item.phoneNumber) ?? 0) + 1);

        expect([...perPerson.values()].every((count) => count === 1)).toBe(true);
    });

    it('mezcla estados y orígenes, y los casos en curso o resueltos tienen quién los atiende', () => {
        const statuses = new Set(data.cases.map((item) => item.status));

        expect(statuses).toEqual(new Set(['open', 'in_progress', 'resolved']));
        expect(data.cases.some((item) => item.source === 'manual')).toBe(true);
        expect(data.cases.some((item) => item.source === 'ai')).toBe(true);
        expect(data.cases.filter((item) => item.status !== 'open').every((item) => item.assignee)).toBe(true);
    });

    it('las instrucciones demo son las de Cafe Kamila', () => {
        expect(DEMO_INSTRUCTIONS).toContain('Cafe Kamila');
    });
});
