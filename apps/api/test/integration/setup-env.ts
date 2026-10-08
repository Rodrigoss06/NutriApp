import { inject } from 'vitest';

// La configuración de la API (env.ts) apunta a la base de Testcontainers como app_user. Llaves sintéticas.
process.env['DATABASE_URL'] = inject('databaseUrls').user;
process.env['ENCRYPTION_KEYS'] =
  `v1:${Buffer.alloc(32, 1).toString('base64')},v2:${Buffer.alloc(32, 3).toString('base64')}`;
process.env['BLIND_INDEX_KEY'] = Buffer.alloc(32, 2).toString('base64');
process.env['APP_URL'] = 'http://localhost:3000';
// Sin servidor SMTP en las pruebas de integración: los correos se prueban con un MailerPort falso.
process.env['SMTP_URL'] = 'smtp://127.0.0.1:1';
// Muchas entradas desde 127.0.0.1 en la misma ventana: el límite de intentos se prueba aparte.
process.env['RATE_LIMIT_FACTOR'] = '100';
