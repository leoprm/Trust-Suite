import api from './api';

export async function openProtectedFile(url: string) {
  const apiUrl = url.replace(/^https?:\/\/[^/]+\/api/, '');
  const response = await api.get(apiUrl, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(response.data);
  window.open(objectUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function isProtectedFileUrl(url: string | null | undefined) {
  return Boolean(url && (url.startsWith('/api/files/') || url.includes('/api/files/')));
}
