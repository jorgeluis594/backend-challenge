import { config } from '@/infra/config';
import { prisma } from '@/infra/db';
import { app } from '@/infra/http/app';

await prisma.$connect();
app.listen(config.port, () => console.log(`API listening on port ${config.port}`));
