import { config } from '@/infra/config';
import { app } from '@/infra/http/app';

app.listen(config.port, () => console.log(`API listening on port ${config.port}`));
