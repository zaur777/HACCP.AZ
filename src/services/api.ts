import { User, Company, JournalTemplate, LogEntry, CCPDefinition, HACCPPlan } from '../types';

const API_BASE = '/api';

export const api = {
  auth: {
    login: (credentials: any) => fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    }).then(res => res.json()),
    logout: () => fetch(`${API_BASE}/auth/logout`, { method: 'POST' }).then(res => res.json()),
    me: () => fetch(`${API_BASE}/auth/me`).then(res => res.json()),
    registerCompany: (data: any) => fetch(`${API_BASE}/auth/register-company`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()),
  },
  admin: {
    stats: () => fetch(`${API_BASE}/admin/stats`).then(res => res.json()),
    updateCompany: (id: number, data: any) => fetch(`${API_BASE}/companies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()),
  },
  companies: {
    list: () => fetch(`${API_BASE}/companies`).then(res => res.json()),
    create: (data: any) => fetch(`${API_BASE}/companies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()),
  },
  users: {
    list: () => fetch(`${API_BASE}/users`).then(res => res.json()),
    create: (data: any) => fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()),
    update: (id: number, data: any) => fetch(`${API_BASE}/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()),
    delete: (id: number) => fetch(`${API_BASE}/users/${id}`, {
      method: 'DELETE'
    }).then(res => res.json()),
  },
  journals: {
    list: () => fetch(`${API_BASE}/journals`).then(res => res.json()),
    create: (data: any) => fetch(`${API_BASE}/journals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()),
  },
  logs: {
    list: () => fetch(`${API_BASE}/logs`).then(res => res.json()),
    create: (data: any) => fetch(`${API_BASE}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()),
  },
  correctiveActions: {
    list: () => fetch(`${API_BASE}/corrective-actions`).then(res => res.json()),
    resolve: (id: number, data: any) => fetch(`${API_BASE}/corrective-actions/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()),
  },
  ccps: {
    list: () => fetch(`${API_BASE}/ccps`).then(res => res.json()),
  },
  haccpPlan: {
    get: () => fetch(`${API_BASE}/haccp-plan`).then(res => res.json()),
    update: (data: any) => fetch(`${API_BASE}/haccp-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()),
  }
};
