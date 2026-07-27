import {auroraLocal} from './chain';

// Direct JSON-RPC to the anvil fork (for dev-only methods like anvil_setBalance / impersonation
// that MetaMask can't perform). Same URL as the app's chain transport.
const RPC_URL = auroraLocal.rpcUrls.default.http[0];

export async function rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
  });
  const json = (await res.json()) as {result?: T; error?: {message: string}};
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}
