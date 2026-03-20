import { User, Company, JournalTemplate, LogEntry, CCPDefinition, HACCPPlan } from '../types';

const API_BASE = '/api';

const handleResponse = async (res: Response) => {
  console.log(`API Response: ${res.status} ${res.url}`);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    // If it's not JSON, use the text as the error message or data
    if (!res.ok) {
      throw new Error(text || `Server error: ${res.status}`);
    }
    return text;
  }

  if (!res.ok) {
    throw new Error(data.error || data.message || `Server error: ${res.status}`);
  }
  return data;
};

export const api = {
  auth: {
    login: (credentials: any) => fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    }).then(handleResponse),
    logout: () => fetch(`${API_BASE}/auth/logout`, { method: 'POST' }).then(handleResponse),
    me: () => fetch(`${API_BASE}/auth/me`).then(handleResponse),
    registerCompany: (data: any) => fetch(`${API_BASE}/auth/register-company`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handleResponse),
    getGoogleUrl: () => fetch(`${API_BASE}/auth/google/url`).then(handleResponse),
  },
  admin: {
    stats: () => fetch(`${API_BASE}/admin/stats`).then(handleResponse),
    updateCompany: (id: number, data: any) => fetch(`${API_BASE}/companies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handleResponse),
  },
  companies: {
    list: () => fetch(`${API_BASE}/companies`).then(handleResponse),
    create: (data: any) => fetch(`${API_BASE}/companies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handleResponse),
  },
  users: {
    list: () => fetch(`${API_BASE}/users`).then(handleResponse),
    create: (data: any) => fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handleResponse),
    update: (id: number, data: any) => fetch(`${API_BASE}/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handleResponse),
    delete: (id: number) => fetch(`${API_BASE}/users/${id}`, {
      method: 'DELETE'
    }).then(handleResponse),
  },
  journals: {
    list: () => fetch(`${API_BASE}/journals`).then(handleResponse),
    create: (data: any) => fetch(`${API_BASE}/journals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handleResponse),
  },
  logs: {
    list: () => fetch(`${API_BASE}/logs`).then(handleResponse),
    create: (data: any) => fetch(`${API_BASE}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handleResponse),
  },
  correctiveActions: {
    list: () => fetch(`${API_BASE}/corrective-actions`).then(handleResponse),
    resolve: (id: number, data: any) => fetch(`${API_BASE}/corrective-actions/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handleResponse),
  },
  ccps: {
    list: () => fetch(`${API_BASE}/ccps`).then(handleResponse),
  },
  haccpPlan: {
    get: () => fetch(`${API_BASE}/haccp-plan`).then(handleResponse),
    update: (data: any) => fetch(`${API_BASE}/haccp-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handleResponse),
  },
  haccpTemplates: {
    list: () => fetch(`${API_BASE}/haccp-templates`).then(handleResponse),
    create: (data: any) => fetch(`${API_BASE}/haccp-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(handleResponse),
    delete: (id: number) => fetch(`${API_BASE}/haccp-templates/${id}`, {
      method: 'DELETE'
    }).then(handleResponse),
  },
  payments: {
    list: () => fetch(`${API_BASE}/payments`).then(handleResponse),
  }
};
