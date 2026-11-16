export interface WindowTotals {
    /** Mensajes que el bot respondió (salientes). */
    answered: number;
    /** Mensajes que escribieron los clientes (entrantes). */
    received: number;
    /** Personas con al menos un mensaje en la ventana. */
    people: number;
    /** Personas cuyo primer contacto cae en la ventana. */
    newPeople: number;
    /** Promedio entre un mensaje entrante y la respuesta que le sigue; 0 si no hubo ninguna. */
    avgResponseSeconds: number;
}

export interface DayCount {
    /** Día local `YYYY-MM-DD`. */
    day: string;
    count: number;
}

/**
 * Agregados del historial para el resumen del panel. Las ventanas son `[from, to)`; `offsetMinutes` es el
 * `Date.getTimezoneOffset()` del navegador (minutos que la hora local va detrás de UTC), para agrupar por hora local.
 */
export abstract class StatsQueryPort {
    abstract totals(from: Date, to: Date): Promise<WindowTotals>;
    /** Respuestas por hora local del día (24 posiciones). */
    abstract answeredByHour(from: Date, to: Date, offsetMinutes: number): Promise<number[]>;
    abstract answeredByDay(from: Date, to: Date, offsetMinutes: number): Promise<DayCount[]>;
    /** Respuestas por día de la semana (lunes primero) y bloque de 3 horas: 7 x 8. */
    abstract heatmap(from: Date, to: Date, offsetMinutes: number): Promise<number[][]>;
}
