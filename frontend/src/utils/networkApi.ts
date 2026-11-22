import { apiUrl } from './tauri';
import type {
  NetworkProject,
  NetworkRecord,
  PreviewResponse,
  SaveNetworkResponse,
  ValidationIssue,
  ValidationResponse,
} from '../types/networkBuilder';

export class NetworkApiError extends Error {
  issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.issues = issues;
  }
}

export async function listNetworks(): Promise<NetworkRecord[]> {
  const res = await fetch(apiUrl('/api/networks'));
  if (!res.ok) throw new Error(`Failed to list networks (${res.status})`);
  return res.json();
}

export async function getNetwork(networkId: string): Promise<NetworkProject> {
  const res = await fetch(apiUrl(`/api/networks/${encodeURIComponent(networkId)}`));
  if (!res.ok) throw new Error(`Failed to load network '${networkId}' (${res.status})`);
  return res.json();
}

export async function saveNetwork(
  networkId: string,
  project: NetworkProject
): Promise<SaveNetworkResponse> {
  const res = await fetch(apiUrl(`/api/networks/${encodeURIComponent(networkId)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body?.detail;
    if (detail && typeof detail === 'object') {
      throw new NetworkApiError(
        detail.message || 'Validation or compile failed',
        Array.isArray(detail.errors) ? detail.errors : []
      );
    }
    throw new NetworkApiError(typeof detail === 'string' ? detail : `Save failed (${res.status})`);
  }
  return res.json();
}

export async function deleteNetwork(networkId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/networks/${encodeURIComponent(networkId)}`), {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || `Delete failed (${res.status})`);
  }
}

export async function validateNetworkProject(
  project: NetworkProject,
  compile = true
): Promise<ValidationResponse> {
  const res = await fetch(apiUrl(`/api/networks/validate?compile=${compile ? 'true' : 'false'}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error(`Validation request failed (${res.status})`);
  return res.json();
}

export async function previewNetworkGeometry(project: NetworkProject): Promise<PreviewResponse> {
  const res = await fetch(apiUrl('/api/networks/preview'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error(`Preview request failed (${res.status})`);
  return res.json();
}
