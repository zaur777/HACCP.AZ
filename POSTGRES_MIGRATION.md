-- PostgreSQL Schema for SafeFood HACCP

-- Companies Table
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  reg_number TEXT,
  address TEXT,
  industry_type TEXT,
  responsible_person TEXT,
  status TEXT DEFAULT 'APPROVED', -- PENDING, APPROVED, SUSPENDED
  tariff_plan TEXT DEFAULT 'BASIC', -- BASIC, PRO, ENTERPRISE
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- SUPER_ADMIN, COMPANY_ADMIN, HACCP_MANAGER, EMPLOYEE, INSPECTOR
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HACCP Plans Table
CREATE TABLE IF NOT EXISTS haccp_plans (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) NOT NULL,
  product_description TEXT,
  flow_diagram TEXT,
  hazard_analysis TEXT,
  ccp_determination TEXT,
  critical_limits TEXT,
  monitoring_procedures TEXT,
  corrective_actions_plan TEXT,
  plan_date DATE,
  plan_time TIME,
  version INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CCP Definitions Table
CREATE TABLE IF NOT EXISTS ccp_definitions (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) NOT NULL,
  name TEXT NOT NULL,
  parameter TEXT,
  min_value NUMERIC,
  max_value NUMERIC,
  unit TEXT,
  monitoring_procedure TEXT,
  corrective_action TEXT
);

-- Journals Table
CREATE TABLE IF NOT EXISTS journals (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id), -- Nullable for global templates
  name TEXT NOT NULL,
  fields JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Logs Table
CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  journal_id INTEGER REFERENCES journals(id) NOT NULL,
  user_id INTEGER REFERENCES users(id) NOT NULL,
  data JSONB NOT NULL,
  status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, DEVIATION
  deviation_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMPTZ
);

-- Corrective Actions Table
CREATE TABLE IF NOT EXISTS corrective_actions (
  id SERIAL PRIMARY KEY,
  log_id INTEGER REFERENCES logs(id) NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'OPEN', -- OPEN, CLOSED
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TIMESTAMPTZ
);

-- Backups Table
CREATE TABLE IF NOT EXISTS backups (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
