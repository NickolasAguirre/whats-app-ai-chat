import { Module } from '@nestjs/common';
import { AuthenticationModule } from '@nestjs/authentication';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuth } from '../../extern/auth/jwt-auth/jwt-auth.js';

@Module({
    imports: [
        ConfigModule,
        AuthenticationModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => ({
            }),
        }),
    ],
    providers: [JwtAuth],
})
export class AuthModule { }
