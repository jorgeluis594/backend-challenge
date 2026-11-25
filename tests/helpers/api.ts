function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run the API tests with \`npm run test:api\``);
  return value;
}

export const API_URL = requiredEnv('API_URL');
export const PROVIDER_URL = requiredEnv('PROVIDER_URL');

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type ApiResponse = { status: number; body: unknown };

/** Sends a JSON request to the service. `body` is null when the response has no content. */
export async function request(method: HttpMethod, path: string, body?: unknown): Promise<ApiResponse> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${API_URL}${path}`, init);
  const text = await response.text();
  if (text === '') return { status: response.status, body: null };
  return { status: response.status, body: JSON.parse(text) };
}

export async function setClock(now: string): Promise<void> {
  const response = await request('PUT', '/test/clock', { now });
  if (response.status !== 204) throw new Error(`PUT /test/clock answered ${response.status}: ${JSON.stringify(response.body)}`);
}

export async function resetProvider(): Promise<void> {
  const response = await fetch(`${PROVIDER_URL}/admin/reset`, { method: 'POST' });
  if (!response.ok) throw new Error(`POST /admin/reset answered ${response.status}`);
}
