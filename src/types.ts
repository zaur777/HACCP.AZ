export type UserRole = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'HACCP_MANAGER' | 'EMPLOYEE' | 'INSPECTOR';

export interface User {
  id: number;
  company_id: number | null;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  company_status?: 'PENDING' | 'APPROVED' | 'SUSPENDED';
  subscription_expires_at?: string;
  company_name?: string;
  industry_type?: string;
  reg_number?: string;
  address?: string;
  phone_number?: string;
  facility_addresses?: string;
}

export interface Company {
  id: number;
  name: string;
  reg_number: string;
  address: string;
  industry_type: string;
  responsible_person: string;
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED';
  tariff_plan: 'BASIC' | 'PRO' | 'ENTERPRISE';
  tariff_duration_months?: number;
  subscription_expires_at?: string;
  settings: string; // JSON
  created_at: string;
}

export interface HACCPPlan {
  id: number;
  company_id: number;
  product_description: string;
  flow_diagram: string; // JSON string
  hazard_analysis: string; // JSON string
  ccp_determination: string; // JSON string
  critical_limits: string; // JSON string
  monitoring_procedures: string; // JSON string
  corrective_actions_plan: string; // JSON string
  plan_date: string | null;
  plan_time: string | null;
  version: number;
  updated_at: string;
}

export interface CCPDefinition {
  id: number;
  company_id: number;
  name: string;
  parameter: string;
  min_value: number | null;
  max_value: number | null;
  unit: string;
  monitoring_procedure: string;
  corrective_action: string;
}

export interface JournalTemplate {
  id: number;
  company_id: number;
  name: string;
  fields: string; // JSON string of field definitions
  created_at: string;
}

export interface LogEntry {
  id: number;
  journal_id: number;
  user_id: number;
  data: string; // JSON string of field values
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DEVIATION';
  deviation_notes?: string;
  created_at: string;
  approved_by?: number;
  approved_at?: string;
}

export interface CorrectiveAction {
  id: number;
  log_id: number;
  description: string;
  status: 'OPEN' | 'CLOSED';
  resolved_by?: number;
  resolved_at?: string;
}
