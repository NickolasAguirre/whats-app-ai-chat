import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDatabaseOptions } from '../../persistence/database.options.js';

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) =>
                buildDatabaseOptions({
                    DATABASE_URL: config.get<string>('DATABASE_URL'),
                    DB_USER: config.get<string>('DB_USER'),
                    DB_PASSWORD: config.get<string>('DB_PASSWORD'),
                    DB_HOST: config.get<string>('DB_HOST'),
                    DB_PORT: config.get<string>('DB_PORT'),
                    DB_NAME: config.get<string>('DB_NAME'),
                }),
        }),
    ],
})
export class DatabaseModule {}
