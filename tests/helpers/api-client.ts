/**
 * Typed API Client for E2E Tests
 *
 * Simple fetch wrapper with auth token support.
 */

export interface ApiClient {
  get(path: string, token?: string): Promise<Response>;
  post(path: string, body: unknown, token?: string): Promise<Response>;
  patch(path: string, body: unknown, token?: string): Promise<Response>;
  delete(path: string, token?: string): Promise<Response>;
}

export function createApiClient(baseUrl: string): ApiClient {
  function headers(token?: string): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }

  return {
    get(path: string, token?: string) {
      return fetch(`${baseUrl}${path}`, { headers: headers(token) });
    },

    post(path: string, body: unknown, token?: string) {
      return fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify(body),
      });
    },

    patch(path: string, body: unknown, token?: string) {
      return fetch(`${baseUrl}${path}`, {
        method: "PATCH",
        headers: headers(token),
        body: JSON.stringify(body),
      });
    },

    delete(path: string, token?: string) {
      return fetch(`${baseUrl}${path}`, {
        method: "DELETE",
        headers: headers(token),
      });
    },
  };
}
