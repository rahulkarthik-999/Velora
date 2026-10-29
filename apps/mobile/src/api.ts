const DEFAULT_API_URL = 'https://veloraweb.online/api';

export class VeloraApiClient {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor(baseUrl = DEFAULT_API_URL) {
    this.baseUrl = baseUrl;
  }

  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Network request failed' }));
      throw new Error(errorData.error || `HTTP ${res.status}`);
    }

    return res.json();
  }

  async getTasks(page = 1, limit = 20, status?: string) {
    let url = `/tasks?page=${page}&limit=${limit}`;
    if (status) url += `&status=${status}`;
    return this.request(url);
  }

  async getTask(taskId: string) {
    return this.request(`/tasks/${taskId}`);
  }

  async createTask(goal: string, attachmentIds: string[] = []) {
    return this.request('/tasks', {
      method: 'POST',
      body: JSON.stringify({ goal, attachmentIds }),
    });
  }

  async executeStep(taskId: string, stepId: string, userInput?: string) {
    return this.request(`/tasks/${taskId}/steps/${stepId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ userInput }),
    });
  }

  async approveStep(taskId: string, stepId: string, approved: boolean, response?: string) {
    return this.request(`/tasks/${taskId}/steps/${stepId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approved, response }),
    });
  }

  async skipStep(taskId: string, stepId: string) {
    return this.request(`/tasks/${taskId}/steps/${stepId}/skip`, {
      method: 'POST',
    });
  }

  async retryStep(taskId: string, stepId: string) {
    return this.request(`/tasks/${taskId}/steps/${stepId}/retry`, {
      method: 'POST',
    });
  }

  async getUsage() {
    return this.request('/usage');
  }

  async uploadFile(fileUri: string, fileName: string, mimeType: string) {
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as any);

    const res = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload error');
    }

    return res.json();
  }
}

export const apiClient = new VeloraApiClient();
