import { apiGet, apiPost } from './apiClient';

export const listRecordings = async () => {
  return await apiGet('/recordings');
};

export const uploadRecording = async (base64: string, mimeType = 'audio/wav', filename?: string, callId?: string) => {
  return await apiPost('/recordings/upload', { base64, mimeType, filename, callId });
};

export const getRecordingSignedUrl = async (id: string, ttlSeconds = 3600) => {
  return await apiPost(`/recordings/${id}/signed-url`, { ttlSeconds });
};
