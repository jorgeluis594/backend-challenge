import type { ProviderClient } from '@/app/ports';
import type { SendOutcome } from '@/domain/reminder';
import { config } from '@/infra/config';

const PROVIDER_TIMEOUT_MS = 5_000;

function outcomeOf(status: number): SendOutcome {
  if (status === 200 || status === 202) return 'delivered';
  if (status === 400 || status === 422) return 'rejected';
  if (status === 503) return 'not_delivered';
  return 'unknown';
}

export const provider: ProviderClient = {
  async sendMessage({ to, text, idempotencyKey }) {
    try {
      const response = await fetch(`${config.providerUrl}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
        body: JSON.stringify({ to, text }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
      return outcomeOf(response.status);
    } catch {
      // A network error or the timeout: the provider may have delivered the message.
      return 'unknown';
    }
  },
};
