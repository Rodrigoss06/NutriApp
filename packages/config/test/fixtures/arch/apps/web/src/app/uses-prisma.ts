// Prohibido (web-no-database): la web lee y escribe solo por la API.
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
