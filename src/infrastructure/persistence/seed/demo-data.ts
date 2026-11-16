// Datos imaginarios de Cafe Kamila para ver el panel lleno. Son deterministas (misma semilla, mismos datos) y no
// tocan la base de datos: `seed-demo.ts` los inserta y `seed:demo:clear` los borra reconociéndolos por estas marcas.

/** Todos los teléfonos demo empiezan así; es lo que permite borrar solo lo demo. */
export const DEMO_PHONE_PREFIX = '+57399';
/** Los mensajes demo llevan este prefijo en `providerMessageId`. */
export const DEMO_PROVIDER_PREFIX = 'demo-';

export const DEMO_INSTRUCTIONS =
    'Eres el asistente virtual de Cafe Kamila, una cafetería de especialidad con panadería propia. ' +
    'Responde siempre en español, con un tono cercano y amable, y sé breve. ' +
    'Horario: lunes a sábado de 7 am a 8 pm, domingos de 8 am a 4 pm. Hacemos domicilios en un radio de 5 km, ' +
    'aceptamos tarjeta, Nequi y efectivo, y tenemos opciones sin gluten y sin lactosa. ' +
    'Si no puedes resolver algo, dilo con honestidad y ofrece que una persona del equipo lo atienda.';

export type DemoRole = 'inbound' | 'outbound';
export type DemoCaseStatus = 'open' | 'in_progress' | 'resolved';

export interface DemoPerson {
    phoneNumber: string;
    name: string | null;
    createdAt: Date;
}

export interface DemoMessage {
    phoneNumber: string;
    role: DemoRole;
    content: string;
    createdAt: Date;
    providerMessageId: string | null;
}

export interface DemoCase {
    phoneNumber: string;
    summary: string;
    status: DemoCaseStatus;
    source: 'ai' | 'manual';
    assignee: string | null;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt: Date | null;
}

export interface DemoData {
    people: DemoPerson[];
    messages: DemoMessage[];
    cases: DemoCase[];
}

interface Scenario {
    turns: [string, string][];
}

interface UnresolvedScenario extends Scenario {
    summary: string;
    note: string;
}

const COLOMBIA_UTC_OFFSET_HOURS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 30;

const NAMES: (string | null)[] = [
    'María Gómez', 'Carlos Ruiz', null, 'Laura Peña', 'Andrés Cardona', 'Valentina Ríos', null, 'Juan Pablo Mejía',
    'Camila Torres', 'Sebastián Vélez', 'Daniela Ospina', null, 'Felipe Salazar', 'Mariana Duque', 'Santiago Arango',
    null, 'Paula Restrepo', 'Nicolás Herrera', 'Isabella Cano', 'Mateo Zapata', null, 'Sofía Londoño', 'Julián Marín',
    'Manuela Builes',
];

const SCENARIOS: Scenario[] = [
    { turns: [['Hola, ¿a qué hora abren hoy?', 'Hola 👋 Hoy atendemos de 7 am a 8 pm. ¡Te esperamos!']] },
    { turns: [['¿Los domingos abren?', 'Sí, los domingos de 8 am a 4 pm.']] },
    {
        turns: [
            ['¿Tienen opciones sin gluten?', 'Sí. Tenemos torta de almendras, galletas de avena y pan de yuca, todo sin gluten.'],
            ['¿Y sin lactosa?', 'También: leche de avena o de almendras para cualquier bebida y brownie vegano.'],
        ],
    },
    {
        turns: [
            ['Quiero reservar una mesa para 4 mañana a las 4 pm', 'Con gusto. ¿A nombre de quién la dejamos?'],
            ['A nombre de Andrea', 'Listo, mesa para 4 mañana a las 4 pm a nombre de Andrea. ¡Te esperamos!'],
        ],
    },
    {
        turns: [
            ['¿Hacen domicilios?', 'Sí, en un radio de 5 km. El costo va de $4.000 a $7.000 según la zona.'],
            ['Estoy en El Poblado', 'Perfecto, el domicilio a El Poblado cuesta $5.000 y llega en unos 35 minutos.'],
        ],
    },
    { turns: [['¿Aceptan Nequi?', 'Sí, aceptamos Nequi, tarjeta débito y crédito, y efectivo.']] },
    {
        turns: [
            ['Quiero una torta para un cumpleaños el sábado', '¡Qué rico! Las tortas van desde $65.000 y necesitamos 48 horas de aviso. ¿Para cuántas personas?'],
            ['Para 12', 'Para 12 personas recomendamos la de zanahoria o la de chocolate de 1,5 kg ($98.000). ¿Cuál prefieres?'],
        ],
    },
    { turns: [['¿Tienen wifi y aceptan mascotas?', 'Wifi gratis, y sí: tenemos terraza pet friendly.']] },
    { turns: [['¿Qué café me recomiendan?', 'El filtrado de Huila es el favorito, con notas a panela y cacao. También el flat white si prefieres algo cremoso.']] },
    {
        turns: [
            ['Hice un pedido hace rato y no ha llegado', 'Lamento la demora. ¿Me das el número del pedido?'],
            ['KAM-2041', 'Lo veo en preparación; sale en 10 minutos y llega en unos 25. Gracias por la paciencia.'],
        ],
    },
    { turns: [['¿Hay parqueadero?', 'Tenemos parqueadero para 6 carros, gratis para clientes por 2 horas.']] },
    { turns: [['¿Cuánto cuesta el desayuno completo?', 'El desayuno completo (huevos, pan, fruta y bebida caliente) cuesta $24.000.']] },
    { turns: [['Buenas noches, ¿todavía están abiertos?', 'Buenas noches. Cerramos a las 8 pm, ¡aún alcanzas a llegar!']] },
];

const UNRESOLVED: UnresolvedScenario[] = [
    {
        turns: [['Me cobraron dos veces mi pedido de ayer', 'Lamento lo ocurrido. Voy a pasar tu caso al equipo para revisar el cobro.']],
        summary: 'Reclamo por cobro doble en el pedido de ayer.',
        note: 'Se verificó en el datáfono: cobro duplicado. Se anuló uno y se avisó a la clienta.',
    },
    {
        turns: [['Necesito café y pasabocas para un evento de 60 personas', 'Para eventos grandes lo mejor es que te atienda una persona de ventas.']],
        summary: 'Cotización de catering para evento de 60 personas.',
        note: 'Se envió cotización por correo y se acordó una visita de degustación.',
    },
    {
        turns: [['Necesito la factura electrónica a nombre de mi empresa', 'Para eso necesito que una persona del equipo revise tus datos fiscales.']],
        summary: 'Solicita factura electrónica con datos de empresa (NIT).',
        note: 'Factura emitida y enviada al correo del cliente.',
    },
    {
        turns: [['Fue muy mala la atención hoy, el mesero fue grosero', 'Lamento mucho lo ocurrido. Voy a escalar tu queja a la administración.']],
        summary: 'Queja por mala atención de un mesero.',
        note: 'Hablamos con el cliente y con el equipo de sala; se ofreció un cupón de cortesía.',
    },
    {
        turns: [['Creo que dejé mi sombrilla en la terraza', 'Voy a pedir que busquen en objetos perdidos y te contactan.']],
        summary: 'Objeto olvidado: sombrilla negra en la terraza.',
        note: 'Se encontró y se guardó en caja hasta que la recoja.',
    },
    {
        turns: [['Quiero un pedido semanal fijo para mi oficina', 'Eso lo coordina una persona del equipo comercial; te contactarán.']],
        summary: 'Pedido corporativo recurrente semanal para oficina.',
        note: 'Se acordó entrega los lunes a las 8 am, 20 cafés y 10 panes.',
    },
    {
        turns: [['Tengo alergia severa a las nueces, ¿puedo comer algo seguro?', 'Por seguridad prefiero que una persona de cocina te confirme los ingredientes.']],
        summary: 'Cliente con alergia severa a nueces consulta qué puede consumir.',
        note: 'Cocina confirmó la lista de productos sin nueces ni trazas.',
    },
    {
        turns: [['Mi tarjeta de regalo no me deja redimirla', 'Voy a pasar tu caso al equipo para revisar la tarjeta.']],
        summary: 'Tarjeta de regalo no se puede redimir.',
        note: 'Se reactivó la tarjeta en el sistema.',
    },
    {
        turns: [['Quisiera hablar con alguien sobre trabajar con ustedes', 'Te paso con el equipo de talento humano.']],
        summary: 'Interesada en trabajar en Cafe Kamila (hoja de vida).',
        note: '',
    },
];

const ASSIGNEES = ['Laura', 'Camilo'];
const PEAK_HOUR_WEIGHTS: [number, number][] = [
    [7, 4], [8, 8], [9, 7], [10, 5], [11, 4], [12, 9], [13, 8], [14, 5], [15, 6], [16, 7], [17, 8], [18, 6], [19, 4],
];
// Domingo primero (Date.getUTCDay): menos movimiento los domingos y sábados.
const WEEKDAY_WEIGHTS = [0.5, 1, 1, 1.1, 1.1, 1.3, 0.8];

/** Generador pseudoaleatorio con semilla (mulberry32): misma semilla, mismos datos. */
function seeded(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pickWeighted<T>(items: [T, number][], random: () => number): T {
    const total = items.reduce((sum, [, weight]) => sum + weight, 0);
    let threshold = random() * total;
    for (const [item, weight] of items) {
        threshold -= weight;
        if (threshold <= 0) return item;
    }
    return items[items.length - 1][0];
}

const phoneFor = (index: number) => `${DEMO_PHONE_PREFIX}${String(1000000 + index * 7919).slice(0, 7)}`;

/** Medianoche local de Colombia del día `daysAgo`, como instante UTC. */
function localDayStart(now: Date, daysAgo: number): Date {
    const local = new Date(now.getTime() - COLOMBIA_UTC_OFFSET_HOURS * 3_600_000);
    const midnightLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - daysAgo * DAY_MS;
    return new Date(midnightLocal + COLOMBIA_UTC_OFFSET_HOURS * 3_600_000);
}

/** Un instante de ese día en horas de atención, o uno cualquiera antes de `now` si es hoy y aún es temprano. */
function pickMoment(dayStart: Date, now: Date, random: () => number): Date | null {
    const hour = pickWeighted(PEAK_HOUR_WEIGHTS, random);
    const candidate = new Date(dayStart.getTime() + (hour * 60 + Math.floor(random() * 60)) * 60_000);
    const latest = now.getTime() - 5 * 60_000;
    if (candidate.getTime() <= latest) return candidate;

    const available = latest - dayStart.getTime();
    return available > 0 ? new Date(dayStart.getTime() + Math.floor(random() * available)) : null;
}

export function buildDemoData(now: Date = new Date()): DemoData {
    const random = seeded(20261115);
    const people: DemoPerson[] = NAMES.map((name, index) => ({
        phoneNumber: phoneFor(index),
        name,
        createdAt: now,
    }));

    const raw: Omit<DemoMessage, 'providerMessageId'>[] = [];
    const unresolved: { phoneNumber: string; scenario: UnresolvedScenario; at: Date }[] = [];

    const addConversation = (phoneNumber: string, scenario: Scenario, start: Date): Date => {
        let cursor = start;
        let last = start;
        for (const [question, answer] of scenario.turns) {
            const answeredAt = new Date(cursor.getTime() + (3 + Math.floor(random() * 7)) * 1000);
            raw.push({ phoneNumber, role: 'inbound', content: question, createdAt: cursor });
            raw.push({ phoneNumber, role: 'outbound', content: answer, createdAt: answeredAt });
            last = answeredAt;
            cursor = new Date(answeredAt.getTime() + (60 + Math.floor(random() * 180)) * 1000);
        }
        return last;
    };

    // Conversaciones normales: más en días de semana y varias hoy, para que el resumen y la lista se vean vivos.
    for (let daysAgo = 0; daysAgo < HISTORY_DAYS; daysAgo += 1) {
        const dayStart = localDayStart(now, daysAgo);
        const weekday = new Date(dayStart.getTime() - COLOMBIA_UTC_OFFSET_HOURS * 3_600_000).getUTCDay();
        const count = daysAgo === 0 ? 9 : Math.round((3 + random() * 3) * WEEKDAY_WEIGHTS[weekday]);

        for (let n = 0; n < count; n += 1) {
            const moment = pickMoment(dayStart, now, random);
            if (!moment) continue;
            const person = people[Math.floor(random() * people.length)];
            addConversation(person.phoneNumber, SCENARIOS[Math.floor(random() * SCENARIOS.length)], moment);
        }
    }

    // Conversaciones que la IA no pudo resolver: cada una termina con la respuesta de derivación y abre un caso.
    UNRESOLVED.forEach((scenario, index) => {
        const daysAgo = [0, 1, 2, 3, 5, 8, 12, 16, 21][index % 9];
        const moment = pickMoment(localDayStart(now, daysAgo), now, random);
        if (!moment) return;
        const person = people[(index * 5 + 3) % people.length];
        const answeredAt = addConversation(person.phoneNumber, scenario, moment);
        unresolved.push({ phoneNumber: person.phoneNumber, scenario, at: answeredAt });
    });

    raw.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const messages: DemoMessage[] = raw.map((message, index) => ({
        ...message,
        providerMessageId: message.role === 'inbound' ? `${DEMO_PROVIDER_PREFIX}${String(index).padStart(5, '0')}` : null,
    }));

    for (const person of people) {
        const first = messages.find((message) => message.phoneNumber === person.phoneNumber);
        person.createdAt = first?.createdAt ?? new Date(now.getTime() - HISTORY_DAYS * DAY_MS);
    }

    return { people, messages, cases: buildCases(unresolved, now) };
}

function buildCases(
    unresolved: { phoneNumber: string; scenario: UnresolvedScenario; at: Date }[],
    now: Date,
): DemoCase[] {
    const ordered = [...unresolved].sort((a, b) => a.at.getTime() - b.at.getTime());
    const latestForPerson = new Map<string, Date>();
    for (const item of ordered) latestForPerson.set(item.phoneNumber, item.at);

    const cases: DemoCase[] = ordered.map((item, index) => {
        const ageDays = (now.getTime() - item.at.getTime()) / DAY_MS;
        // Un caso automático solo puede estar activo si es el último de esa persona (índice único parcial).
        const isLatest = latestForPerson.get(item.phoneNumber) === item.at;
        const resolved = !isLatest || ageDays > 6 || (ageDays > 2 && index % 2 === 0);
        const status: DemoCaseStatus = resolved ? 'resolved' : ageDays > 0.5 ? 'in_progress' : 'open';
        const resolvedAt = resolved ? new Date(Math.min(now.getTime(), item.at.getTime() + (4 + (index % 5) * 6) * 3_600_000)) : null;
        const assignee = status === 'open' ? null : ASSIGNEES[index % ASSIGNEES.length];

        return {
            phoneNumber: item.phoneNumber,
            summary: item.scenario.summary,
            status,
            source: 'ai',
            assignee,
            note: resolved ? item.scenario.note || 'Se atendió por teléfono.' : status === 'in_progress' ? 'Ya se contactó al cliente, a la espera de respuesta.' : null,
            createdAt: item.at,
            updatedAt: resolvedAt ?? new Date(Math.min(now.getTime(), item.at.getTime() + 2 * 3_600_000)),
            resolvedAt,
        };
    });

    // Dos casos registrados a mano por el call center desde una conversación.
    const manualAt = new Date(now.getTime() - 5 * 3_600_000);
    cases.push(
        {
            phoneNumber: phoneFor(8),
            summary: 'Pidió que lo llamen para cotizar un evento de cumpleaños.',
            status: 'open',
            source: 'manual',
            assignee: null,
            note: null,
            createdAt: manualAt,
            updatedAt: manualAt,
            resolvedAt: null,
        },
        {
            phoneNumber: phoneFor(13),
            summary: 'Cambio de dirección de un domicilio ya despachado.',
            status: 'resolved',
            source: 'manual',
            assignee: 'Camilo',
            note: 'Se llamó al domiciliario y se entregó en la nueva dirección.',
            createdAt: new Date(now.getTime() - 3 * DAY_MS),
            updatedAt: new Date(now.getTime() - 3 * DAY_MS + 2 * 3_600_000),
            resolvedAt: new Date(now.getTime() - 3 * DAY_MS + 2 * 3_600_000),
        },
    );

    return cases;
}
