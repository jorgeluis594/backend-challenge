import { makeHandleInboundMessage } from '@/app/handle-inbound-message';
import { transaction } from '@/infra/repositories';

export const handleInboundMessage = makeHandleInboundMessage({ transaction });
