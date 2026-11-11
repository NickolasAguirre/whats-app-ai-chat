import { DataSource } from 'typeorm';
import { buildDatabaseOptions } from './database.options.js';

// Punto de entrada del CLI de TypeORM (migration:run / migration:revert).
export default new DataSource(buildDatabaseOptions(process.env));
