import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("haccp.db");
const JWT_SECRET = process.env.JWT_SECRET || "haccp-secret-key-123";

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    reg_number TEXT,
    address TEXT,
    industry_type TEXT,
    responsible_person TEXT,
    status TEXT DEFAULT 'APPROVED', -- PENDING, APPROVED, SUSPENDED
    tariff_plan TEXT DEFAULT 'BASIC', -- BASIC, PRO, ENTERPRISE
    settings TEXT DEFAULT '{}', -- JSON for custom branding/config
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL, -- SUPER_ADMIN, COMPANY_ADMIN, HACCP_MANAGER, EMPLOYEE, INSPECTOR
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies (id)
  );

  CREATE TABLE IF NOT EXISTS haccp_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    product_description TEXT,
    flow_diagram TEXT,
    hazard_analysis TEXT,
    ccp_determination TEXT,
    critical_limits TEXT,
    monitoring_procedures TEXT,
    corrective_actions_plan TEXT,
    plan_date TEXT,
    plan_time TEXT,
    version INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies (id)
  );

  -- Add missing columns if they don't exist (for existing databases)
  PRAGMA table_info(haccp_plans);
`);

// Migration helper for haccp_plans
const columns = db.prepare("PRAGMA table_info(haccp_plans)").all();
const columnNames = columns.map((c: any) => c.name);
if (!columnNames.includes('critical_limits')) {
  db.exec("ALTER TABLE haccp_plans ADD COLUMN critical_limits TEXT");
}
if (!columnNames.includes('monitoring_procedures')) {
  db.exec("ALTER TABLE haccp_plans ADD COLUMN monitoring_procedures TEXT");
}
if (!columnNames.includes('corrective_actions_plan')) {
  db.exec("ALTER TABLE haccp_plans ADD COLUMN corrective_actions_plan TEXT");
}
if (!columnNames.includes('plan_date')) {
  db.exec("ALTER TABLE haccp_plans ADD COLUMN plan_date TEXT");
}
if (!columnNames.includes('plan_time')) {
  db.exec("ALTER TABLE haccp_plans ADD COLUMN plan_time TEXT");
}

// Migration helper for companies (add status, tariff_plan, settings)
const companyColumns = db.prepare("PRAGMA table_info(companies)").all();
const companyColNames = companyColumns.map((c: any) => c.name);
if (!companyColNames.includes('status')) {
  db.exec("ALTER TABLE companies ADD COLUMN status TEXT DEFAULT 'APPROVED'");
}
if (!companyColNames.includes('tariff_plan')) {
  db.exec("ALTER TABLE companies ADD COLUMN tariff_plan TEXT DEFAULT 'BASIC'");
}
if (!companyColNames.includes('settings')) {
  db.exec("ALTER TABLE companies ADD COLUMN settings TEXT DEFAULT '{}'");
}

// Migration helper for users (add is_active)
const userColumns = db.prepare("PRAGMA table_info(users)").all();
if (!userColumns.find((c: any) => c.name === 'is_active')) {
  db.exec("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS ccp_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    parameter TEXT,
    min_value REAL,
    max_value REAL,
    unit TEXT,
    monitoring_procedure TEXT,
    corrective_action TEXT,
    FOREIGN KEY (company_id) REFERENCES companies (id)
  );

  CREATE TABLE IF NOT EXISTS journals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER, -- Made nullable to allow Super Admin templates
    name TEXT NOT NULL,
    fields TEXT NOT NULL, -- JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies (id)
  );
`);

// Migration helper for journals (make company_id nullable)
const journalColumns = db.prepare("PRAGMA table_info(journals)").all();
const companyIdCol = journalColumns.find((c: any) => c.name === 'company_id');
if (companyIdCol && companyIdCol.notnull === 1) {
  console.log("Migrating journals table to make company_id nullable...");
  db.exec(`
    CREATE TABLE journals_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER,
      name TEXT NOT NULL,
      fields TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies (id)
    );
    INSERT INTO journals_new (id, company_id, name, fields, created_at)
    SELECT id, company_id, name, fields, created_at FROM journals;
    DROP TABLE journals;
    ALTER TABLE journals_new RENAME TO journals;
  `);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    journal_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    data TEXT NOT NULL, -- JSON
    status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, DEVIATION
    deviation_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_by INTEGER,
    approved_at DATETIME,
    FOREIGN KEY (journal_id) REFERENCES journals (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS corrective_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'OPEN', -- OPEN, CLOSED
    resolved_by INTEGER,
    resolved_at DATETIME,
    FOREIGN KEY (log_id) REFERENCES logs (id)
  );

  CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Backup Logic
const BACKUP_DIR = path.join(__dirname, "backups");
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR);
}

async function performBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `haccp-backup-${timestamp}.db`;
  const dest = path.join(BACKUP_DIR, filename);
  
  try {
    await db.backup(dest);
    console.log(`Backup successful: ${filename}`);
    db.prepare("INSERT INTO backups (filename) VALUES (?)").run(filename);
    
    // Keep only last 10 backups
    const oldBackups = db.prepare("SELECT * FROM backups ORDER BY created_at DESC LIMIT -1 OFFSET 10").all();
    oldBackups.forEach((b: any) => {
      const oldPath = path.join(BACKUP_DIR, b.filename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      db.prepare("DELETE FROM backups WHERE id = ?").run(b.id);
    });
  } catch (err) {
    console.error("Backup failed:", err);
  }
}

// Run backup every 6 hours
setInterval(performBackup, 6 * 60 * 60 * 1000);
// Also run one on startup after a short delay
setTimeout(performBackup, 10000);

// Seed Super Admin if not exists
const superAdmin = db.prepare("SELECT * FROM users WHERE role = 'SUPER_ADMIN'").get();
if (!superAdmin) {
  const hash = bcrypt.hashSync("admin123", 10);
  db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)").run(
    "admin@safeflow.com",
    hash,
    "Super Admin",
    "SUPER_ADMIN"
  );

  // Seed Demo Company
  const companyResult = db.prepare("INSERT INTO companies (name, reg_number, address, industry_type, responsible_person) VALUES (?, ?, ?, ?, ?)").run(
    "FreshBite Catering", "REG-12345", "123 Food St, London", "Catering", "John Chef"
  );
  const companyId = companyResult.lastInsertRowid;

  // Seed Company Admin
  db.prepare("INSERT INTO users (company_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)").run(
    companyId, "manager@freshbite.com", hash, "John Chef", "COMPANY_ADMIN"
  );

  // Seed CCPs
  db.prepare("INSERT INTO ccp_definitions (company_id, name, parameter, min_value, max_value, unit) VALUES (?, ?, ?, ?, ?, ?)").run(
    companyId, "Fridge Temperature", "temp", 1, 5, "°C"
  );
  db.prepare("INSERT INTO ccp_definitions (company_id, name, parameter, min_value, max_value, unit) VALUES (?, ?, ?, ?, ?, ?)").run(
    companyId, "Cooking Temperature", "core_temp", 75, 100, "°C"
  );

  // Seed Journal Templates
  db.prepare("INSERT INTO journals (company_id, name, fields) VALUES (?, ?, ?)").run(
    companyId, "Daily Fridge Log", JSON.stringify([
      { name: "fridge_id", label: "Fridge ID", type: "text" },
      { name: "temp", label: "Temperature (°C)", type: "number" },
      { name: "notes", label: "Notes", type: "text" }
    ])
  );
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // Auth Middleware
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  // Auth Routes
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check company status if not super admin
    if (user.role !== 'SUPER_ADMIN' && user.company_id) {
      const company: any = db.prepare("SELECT status FROM companies WHERE id = ?").get(user.company_id);
      if (company && company.status === 'PENDING') {
        return res.status(403).json({ error: "Your company registration is pending approval." });
      }
      if (company && company.status === 'SUSPENDED') {
        return res.status(403).json({ error: "Your company account has been suspended." });
      }
    }

    const token = jwt.sign({ id: user.id, company_id: user.company_id, role: user.role }, JWT_SECRET, { expiresIn: "24h" });
    res.cookie("token", token, { httpOnly: true, secure: true, sameSite: "none" });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, company_id: user.company_id } });
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ success: true });
  });

  app.post("/api/auth/register-company", (req, res) => {
    const { companyName, adminName, adminEmail, adminPassword, industryType } = req.body;
    console.log("Registration request received:", { companyName, adminName, adminEmail, industryType });
    
    try {
      if (!companyName || !adminName || !adminEmail || !adminPassword) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail);
      if (existingUser) {
        console.log("Registration failed: Email already registered", adminEmail);
        return res.status(400).json({ error: "Email already registered" });
      }

      const companyResult = db.prepare(`
        INSERT INTO companies (name, industry_type, status, tariff_plan) 
        VALUES (?, ?, 'PENDING', 'BASIC')
      `).run(companyName, industryType);
      
      const companyId = companyResult.lastInsertRowid;
      console.log("Company created with ID:", companyId);

      const hash = bcrypt.hashSync(adminPassword, 10);
      
      db.prepare(`
        INSERT INTO users (company_id, email, password_hash, name, role, is_active) 
        VALUES (?, ?, ?, ?, 'COMPANY_ADMIN', 1)
      `).run(companyId, adminEmail, hash, adminName);

      console.log("User created for company:", companyId);
      res.json({ success: true, message: "Registration successful. Waiting for approval." });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).json({ error: "Registration failed: " + (err instanceof Error ? err.message : String(err)) });
    }
  });

  app.get("/api/auth/me", authenticate, (req: any, res) => {
    const user: any = db.prepare("SELECT id, name, email, role, company_id FROM users WHERE id = ?").get(req.user.id);
    res.json({ user });
  });

  // Company Routes
  app.get("/api/companies", authenticate, (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: "Forbidden" });
    const companies = db.prepare("SELECT * FROM companies ORDER BY created_at DESC").all();
    res.json(companies);
  });

  app.patch("/api/companies/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: "Forbidden" });
    const { status, tariff_plan, settings } = req.body;
    const companyId = req.params.id;

    try {
      const company = db.prepare("SELECT * FROM companies WHERE id = ?").get(companyId) as any;
      if (!company) return res.status(404).json({ error: "Company not found" });

      db.prepare(`
        UPDATE companies 
        SET status = ?, tariff_plan = ?, settings = ? 
        WHERE id = ?
      `).run(
        status || company.status,
        tariff_plan || company.tariff_plan,
        settings ? JSON.stringify(settings) : company.settings,
        companyId
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Update failed" });
    }
  });

  app.get("/api/admin/stats", authenticate, (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: "Forbidden" });
    
    const stats = {
      totalCompanies: db.prepare("SELECT COUNT(*) as count FROM companies").get().count,
      pendingCompanies: db.prepare("SELECT COUNT(*) as count FROM companies WHERE status = 'PENDING'").get().count,
      totalUsers: db.prepare("SELECT COUNT(*) as count FROM users").get().count,
      totalLogs: db.prepare("SELECT COUNT(*) as count FROM logs").get().count,
    };
    res.json(stats);
  });

  app.post("/api/companies", authenticate, (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: "Forbidden" });
    const { name, reg_number, address, industry_type, responsible_person } = req.body;
    const result = db.prepare("INSERT INTO companies (name, reg_number, address, industry_type, responsible_person) VALUES (?, ?, ?, ?, ?)").run(
      name, reg_number, address, industry_type, responsible_person
    );
    res.json({ id: result.lastInsertRowid });
  });

  // User Management (Company Admin)
  app.get("/api/users", authenticate, (req: any, res) => {
    const companyId = req.user.company_id;
    if (!companyId && req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: "Forbidden" });
    
    let users;
    if (req.user.role === 'SUPER_ADMIN') {
      users = db.prepare("SELECT id, name, email, role, company_id, is_active FROM users").all();
    } else {
      // Users in the same company
      users = db.prepare("SELECT id, name, email, role, company_id, is_active FROM users WHERE company_id = ?").all(companyId);
    }
    res.json(users);
  });

  app.post("/api/users", authenticate, (req: any, res) => {
    const { name, email, password, role, company_id } = req.body;
    
    if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'COMPANY_ADMIN') {
      return res.status(403).json({ error: "Forbidden" });
    }

    const targetCompanyId = req.user.role === 'SUPER_ADMIN' ? (company_id || null) : req.user.company_id;
    const hash = bcrypt.hashSync(password, 10);
    
    try {
      const result = db.prepare("INSERT INTO users (name, email, password_hash, role, company_id, is_active) VALUES (?, ?, ?, ?, ?, 1)").run(
        name, email, hash, role, targetCompanyId
      );
      console.log(`User created: ${name} (ID: ${result.lastInsertRowid}) for company: ${targetCompanyId}`);
      res.json({ id: result.lastInsertRowid });
    } catch (err: any) {
      console.error("Error creating user:", err);
      res.status(400).json({ error: err.message.includes('UNIQUE') ? "Email already exists" : "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'COMPANY_ADMIN') {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { name, email, role, is_active, company_id } = req.body;
    const userId = req.params.id;

    const targetUser = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
    if (!targetUser) return res.status(404).json({ error: "User not found" });
    
    if (req.user.role !== 'SUPER_ADMIN' && targetUser.company_id !== req.user.company_id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    try {
      db.prepare("UPDATE users SET name = ?, email = ?, role = ?, is_active = ?, company_id = ? WHERE id = ?").run(
        name || targetUser.name,
        email || targetUser.email,
        role || targetUser.role,
        is_active !== undefined ? (is_active ? 1 : 0) : targetUser.is_active,
        req.user.role === 'SUPER_ADMIN' ? (company_id !== undefined ? company_id : targetUser.company_id) : targetUser.company_id,
        userId
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error updating user:", err);
      res.status(400).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", authenticate, (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'COMPANY_ADMIN') {
      return res.status(403).json({ error: "Forbidden" });
    }
    const userId = req.params.id;

    const targetUser = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
    if (!targetUser) return res.status(404).json({ error: "User not found" });
    
    if (req.user.role !== 'SUPER_ADMIN' && targetUser.company_id !== req.user.company_id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (Number(userId) === req.user.id) {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }

    try {
      db.prepare("DELETE FROM users WHERE id = ?").run(userId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error deleting user:", err);
      res.status(400).json({ error: "Failed to delete user" });
    }
  });

  // Journal Templates
  app.get("/api/journals", authenticate, (req: any, res) => {
    let journals;
    if (req.user.role === 'SUPER_ADMIN') {
      journals = db.prepare("SELECT * FROM journals").all();
    } else {
      // Show journals for the company OR global journals (company_id IS NULL)
      journals = db.prepare("SELECT * FROM journals WHERE company_id = ? OR company_id IS NULL").all(req.user.company_id);
    }
    res.json(journals);
  });

  app.post("/api/journals", authenticate, (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'HACCP_MANAGER') {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { name, fields, company_id } = req.body;
    const targetCompanyId = req.user.role === 'SUPER_ADMIN' ? (company_id || null) : req.user.company_id;
    
    try {
      const result = db.prepare("INSERT INTO journals (company_id, name, fields) VALUES (?, ?, ?)").run(
        targetCompanyId, name, JSON.stringify(fields)
      );
      console.log(`Journal created: ${name} (ID: ${result.lastInsertRowid}) for company: ${targetCompanyId}`);
      res.json({ id: result.lastInsertRowid });
    } catch (err: any) {
      console.error("Error creating journal:", err);
      res.status(400).json({ error: "Failed to create journal" });
    }
  });

  // Logs
  app.get("/api/logs", authenticate, (req: any, res) => {
    let logs;
    if (req.user.role === 'SUPER_ADMIN') {
      logs = db.prepare(`
        SELECT l.*, j.name as journal_name, u.name as user_name 
        FROM logs l
        JOIN journals j ON l.journal_id = j.id
        JOIN users u ON l.user_id = u.id
        ORDER BY l.created_at DESC
      `).all();
    } else {
      logs = db.prepare(`
        SELECT l.*, j.name as journal_name, u.name as user_name 
        FROM logs l
        JOIN journals j ON l.journal_id = j.id
        JOIN users u ON l.user_id = u.id
        WHERE j.company_id = ?
        ORDER BY l.created_at DESC
      `).all(req.user.company_id);
    }
    res.json(logs.map((l: any) => ({ ...l, data: JSON.parse(l.data) })));
  });

  app.post("/api/logs", authenticate, (req: any, res) => {
    const { journal_id, data } = req.body;
    const companyId = req.user.company_id;
    
    // CCP Check logic
    const ccps: any = db.prepare("SELECT * FROM ccp_definitions WHERE company_id = ?").all(companyId);
    let status = 'APPROVED';
    let deviation_notes = '';

    for (const ccp of ccps) {
      const value = data[ccp.parameter];
      if (value !== undefined) {
        if ((ccp.min_value !== null && value < ccp.min_value) || 
            (ccp.max_value !== null && value > ccp.max_value)) {
          status = 'DEVIATION';
          deviation_notes += `CCP Violation: ${ccp.name} value ${value} is out of range (${ccp.min_value ?? '-'} to ${ccp.max_value ?? '-'}). `;
        }
      }
    }

    const result = db.prepare("INSERT INTO logs (journal_id, user_id, data, status, deviation_notes) VALUES (?, ?, ?, ?, ?)").run(
      journal_id, req.user.id, JSON.stringify(data), status, deviation_notes
    );

    const logId = result.lastInsertRowid;

    if (status === 'DEVIATION') {
      db.prepare("INSERT INTO corrective_actions (log_id, description) VALUES (?, ?)").run(
        logId, `Automated alert: ${deviation_notes}`
      );
    }

    res.json({ id: logId, status, deviation_notes });
  });

  // Corrective Actions
  app.get("/api/corrective-actions", authenticate, (req: any, res) => {
    let actions;
    if (req.user.role === 'SUPER_ADMIN') {
      actions = db.prepare(`
        SELECT ca.*, l.created_at as log_date, j.name as journal_name
        FROM corrective_actions ca
        JOIN logs l ON ca.log_id = l.id
        JOIN journals j ON l.journal_id = j.id
      `).all();
    } else {
      actions = db.prepare(`
        SELECT ca.*, l.created_at as log_date, j.name as journal_name
        FROM corrective_actions ca
        JOIN logs l ON ca.log_id = l.id
        JOIN journals j ON l.journal_id = j.id
        WHERE j.company_id = ?
      `).all(req.user.company_id);
    }
    res.json(actions);
  });

  app.post("/api/corrective-actions/:id/resolve", authenticate, (req: any, res) => {
    const { id } = req.params;
    const { description } = req.body;
    db.prepare("UPDATE corrective_actions SET status = 'CLOSED', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      req.user.id, id
    );
    res.json({ success: true });
  });

  // CCP Definitions
  app.get("/api/ccps", authenticate, (req: any, res) => {
    let ccps;
    if (req.user.role === 'SUPER_ADMIN') {
      ccps = db.prepare("SELECT * FROM ccp_definitions").all();
    } else {
      ccps = db.prepare("SELECT * FROM ccp_definitions WHERE company_id = ?").all(req.user.company_id);
    }
    res.json(ccps);
  });

  // Backup Management
  app.get("/api/backups", authenticate, (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: "Forbidden" });
    const backups = db.prepare("SELECT * FROM backups ORDER BY created_at DESC").all();
    res.json(backups);
  });

  app.post("/api/backups/trigger", authenticate, async (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: "Forbidden" });
    await performBackup();
    res.json({ success: true });
  });

  app.get("/api/backups/:id/download", authenticate, (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: "Forbidden" });
    const backup: any = db.prepare("SELECT * FROM backups WHERE id = ?").get(req.params.id);
    if (!backup) return res.status(404).json({ error: "Backup not found" });
    
    const filePath = path.join(BACKUP_DIR, backup.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
    
    res.download(filePath);
  });

  // HACCP Plans
  app.get("/api/haccp-plan", authenticate, (req: any, res) => {
    const companyId = req.user.company_id;
    let plan = db.prepare("SELECT * FROM haccp_plans WHERE company_id = ?").get(companyId);
    if (!plan) {
      db.prepare(`
        INSERT INTO haccp_plans (
          company_id, 
          product_description, 
          flow_diagram, 
          hazard_analysis, 
          ccp_determination, 
          critical_limits, 
          monitoring_procedures, 
          corrective_actions_plan
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        companyId, 
        "Default Product Description", 
        "[]", "[]", "[]", "[]", "[]", "[]"
      );
      plan = db.prepare("SELECT * FROM haccp_plans WHERE company_id = ?").get(companyId);
    }
    res.json(plan);
  });

  app.post("/api/haccp-plan", authenticate, (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'HACCP_MANAGER') {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { 
      product_description, 
      flow_diagram, 
      hazard_analysis, 
      ccp_determination,
      critical_limits,
      monitoring_procedures,
      corrective_actions_plan,
      plan_date,
      plan_time,
      company_id
    } = req.body;
    const targetCompanyId = req.user.role === 'SUPER_ADMIN' ? (company_id || 1) : req.user.company_id;
    
    db.prepare(`
      UPDATE haccp_plans 
      SET product_description = ?, 
          flow_diagram = ?, 
          hazard_analysis = ?, 
          ccp_determination = ?, 
          critical_limits = ?,
          monitoring_procedures = ?,
          corrective_actions_plan = ?,
          plan_date = ?,
          plan_time = ?,
          version = version + 1, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE company_id = ?
    `).run(
      product_description, 
      flow_diagram, 
      hazard_analysis, 
      ccp_determination, 
      critical_limits,
      monitoring_procedures,
      corrective_actions_plan,
      plan_date,
      plan_time,
      targetCompanyId
    );
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
