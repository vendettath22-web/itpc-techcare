type ApiResponse<T> = { data: T } | { error: string };

export async function requestApi<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch('/takecare/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    credentials: 'same-origin',
    body: JSON.stringify({ action, ...payload }),
  });
  const result = await response.json() as ApiResponse<T>;
  if (!response.ok || !('data' in result)) {
    throw new Error('error' in result ? result.error : 'API request failed');
  }
  return result.data;
}
