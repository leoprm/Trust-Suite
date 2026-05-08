import api from './api';

function fallbackFilename(path: string) {
  if (path.includes('/tree/')) return `trust-tree-export-${new Date().toISOString().slice(0, 10)}.json`;
  return `trust-profile-export-${new Date().toISOString().slice(0, 10)}.json`;
}

function getFilename(contentDisposition: string | undefined, path: string) {
  const match = contentDisposition?.match(/filename="([^"]+)"/i);
  return match?.[1] || fallbackFilename(path);
}

export async function downloadJsonExport(path: string) {
  const response = await api.get(path, { responseType: 'blob' });
  const filename = getFilename(response.headers['content-disposition'], path);
  const blob = new Blob([response.data], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadPdfExport(path: string) {
  const response = await api.get(path, { responseType: 'blob' });
  const filename = getFilename(response.headers['content-disposition'], path);
  const blob = new Blob([response.data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
