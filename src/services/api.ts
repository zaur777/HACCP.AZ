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
      body: JSON.stringify(credentials),
      credentials: 'include'
    }).then(handleResponse),
    logout: () => fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).then(handleResponse),
    me: () => fetch(`${API_BASE}/auth/me`, { credentials: 'include' }).then(handleResponse),
    registerCompany: (data: any) => fetch(`${API_BASE}/auth/register-company`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    }).then(handleResponse),
    getGoogleUrl: () => fetch(`${API_BASE}/auth/google/url`, { credentials: 'include' }).then(handleResponse),
  },
  admin: {
    stats: () => fetch(`${API_BASE}/admin/stats`, { credentials: 'include' }).then(handleResponse),
    updateCompany: (id: number, data: any) => fetch(`${API_BASE}/companies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    }).then(handleResponse),
  },
  companies: {
    list: () => fetch(`${API_BASE}/companies`, { credentials: 'include' }).then(handleResponse),
    create: (data: any) => fetch(`${API_BASE}/companies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    }).then(handleResponse),
  },
  users: {
    list: () => fetch(`${API_BASE}/users`, { credentials: 'include' }).then(handleResponse),
    create: (data: any) => fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    }).then(handleResponse),
    update: (id: number, data: any) => fetch(`${API_BASE}/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    }).then(handleResponse),
    delete: (id: number) => fetch(`${API_BASE}/users/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    }).then(handleResponse),
  },
  journals: {
    list: () => fetch(`${API_BASE}/journals`, { credentials: 'include' }).then(handleResponse),
    create: (data: any) => fetch(`${API_BASE}/journals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    }).then(handleResponse),
  },
  logs: {
    list: () => fetch(`${API_BASE}/logs`, { credentials: 'include' }).then(handleResponse),
    create: (data: any) => fetch(`${API_BASE}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    }).then(handleResponse),
  },
  correctiveActions: {
    list: () => fetch(`${API_BASE}/corrective-actions`, { credentials: 'include' }).then(handleResponse),
    resolve: (id: number, data: any) => fetch(`${API_BASE}/corrective-actions/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    }).then(handleResponse),
  },
  ccps: {
    list: () => fetch(`${API_BASE}/ccps`, { credentials: 'include' }).then(handleResponse),
  },
  haccpPlan: {
    get: () => fetch(`${API_BASE}/haccp-plan`, { credentials: 'include' }).then(handleResponse),
    update: (data: any) => fetch(`${API_BASE}/haccp-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    }).then(handleResponse),
  },
  haccpTemplates: {
    list: () => fetch(`${API_BASE}/haccp-templates`, { credentials: 'include' }).then(handleResponse),
    create: (data: any) => fetch(`${API_BASE}/haccp-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    }).then(handleResponse),
    delete: (id: number) => fetch(`${API_BASE}/haccp-templates/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    }).then(handleResponse),
  },
  payments: {
    list: () => fetch(`${API_BASE}/payments`, { credentials: 'include' }).then(handleResponse),
  }
};
