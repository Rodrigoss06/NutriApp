import './env-file.js';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { API_PORT, configureHttp } from './platform/index.js';

const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
configureHttp(app);
app.enableShutdownHooks();
await app.listen(API_PORT);
