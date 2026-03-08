import express from "express";
import { createServer as createViteServer } from "vite";
import pkg from "pg";
const { Pool } = pkg;
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config();

if (!process.env.DB_PASSWORD) {
  console.warn("DB_PASSWORD is not set in environment variables. Database connection may fail.");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  host: process.env.DB_HOST || "31.220.80.185",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "haccp_az",
  user: process.env.DB_USER || "haccp_az",
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000, // 5 second timeout
  idleTimeoutMillis: 10000,
});

// Test database connection
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("Database connection failed:", err.message);
  } else {
    console.log("Database connected successfully at:", res.rows[0].now);
  }
});

const JWT_SECRET = process.env.JWT_SECRET || "haccp-secret-key-123";

async function seedSuperAdmin() {
  try {
    console.log("Checking for Super Admin in database...");
    const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", ["admin@safeflow.com"]);
    console.log(`Found ${rows.length} admin users.`);
    if (rows.length === 0) {
      console.log("Super Admin not found. Seeding...");
      const hash = bcrypt.hashSync("admin123", 10);
      await pool.query(
        "INSERT INTO users (email, password_hash, name, role, is_active) VALUES ($1, $2, $3, $4, $5)",
        ["admin@safeflow.com", hash, "Super Admin", "SUPER_ADMIN", true]
      );
      console.log("Super Admin seeded: admin@safeflow.com / admin123");
    } else {
      console.log("Super Admin already exists.");
    }
  } catch (err) {
    console.error("Auto-seeding failed:", err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Run auto-seeding in background (don't block server startup)
  seedSuperAdmin().catch(err => console.error("Background seeding failed:", err));

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

  // Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/test", (req, res) => {
    res.send("API is working!");
  });

  // Debug Route (Remove in production)
  app.get("/api/debug/db", async (req, res) => {
    try {
      const dbCheck = await pool.query("SELECT NOW()");
      const userCheck = await pool.query("SELECT id, email, role FROM users WHERE email = $1", ["admin@safeflow.com"]);
      const tableCheck = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
      
      res.json({
        dbConnected: true,
        dbTime: dbCheck.rows[0].now,
        envStatus: {
          hasDbPassword: !!process.env.DB_PASSWORD,
          dbHost: process.env.DB_HOST || "31.220.80.185",
          dbUser: process.env.DB_USER || "haccp_az",
          dbName: process.env.DB_NAME || "haccp_az"
        },
        adminExists: userCheck.rows.length > 0,
        adminDetails: userCheck.rows[0] || null,
        existingTables: tableCheck.rows.map(r => r.table_name)
      });
    } catch (err) {
      res.status(500).json({
        dbConnected: false,
        envStatus: {
          hasDbPassword: !!process.env.DB_PASSWORD,
          dbHost: process.env.DB_HOST || "31.220.80.185"
        },
        error: err instanceof Error ? err.message : String(err)
      });
    }
  });

  // Auth Routes
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    console.log(`Login attempt for: ${email}`);
    
    try {
      const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
      const user = rows[0];

      if (!user) {
        console.log(`User not found: ${email}`);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
      console.log(`Password valid for ${email}: ${isPasswordValid}`);

      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Check company status if not super admin
      if (user.role !== 'SUPER_ADMIN' && user.company_id) {
        const { rows: companyRows } = await pool.query("SELECT status FROM companies WHERE id = $1", [user.company_id]);
        const company = companyRows[0];

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
    } catch (err) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ success: true });
  });

  app.post("/api/auth/register-company", async (req, res) => {
    const { companyName, adminName, adminEmail, adminPassword, industryType } = req.body;
    
    try {
      if (!companyName || !adminName || !adminEmail || !adminPassword) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const { rows: existingUsers } = await pool.query("SELECT id FROM users WHERE email = $1", [adminEmail]);
      if (existingUsers.length > 0) {
        return res.status(400).json({ error: "Email already registered" });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const companyRes = await client.query(
          "INSERT INTO companies (name, industry_type, status, tariff_plan) VALUES ($1, $2, 'PENDING', 'BASIC') RETURNING id",
          [companyName, industryType]
        );
        const companyId = companyRes.rows[0].id;

        const hash = bcrypt.hashSync(adminPassword, 10);
        await client.query(
          "INSERT INTO users (company_id, email, password_hash, name, role, is_active) VALUES ($1, $2, $3, $4, 'COMPANY_ADMIN', true)",
          [companyId, adminEmail, hash, adminName]
        );
        await client.query('COMMIT');
        res.json({ success: true, message: "Registration successful. Waiting for approval." });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.get("/api/auth/me", authenticate, async (req: any, res) => {
    try {
      const { rows } = await pool.query("SELECT id, name, email, role, company_id FROM users WHERE id = $1", [req.user.id]);
      const user = rows[0];
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ user });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Company Routes
  app.get("/api/companies", authenticate, async (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: "Forbidden" });
    try {
      const { rows } = await pool.query("SELECT * FROM companies ORDER BY created_at DESC");
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  app.patch("/api/companies/:id", authenticate, async (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: "Forbidden" });
    const { status, tariff_plan, settings } = req.body;
    const companyId = req.params.id;

    try {
      const { rows } = await pool.query("SELECT * FROM companies WHERE id = $1", [companyId]);
      const company = rows[0];
      if (!company) return res.status(404).json({ error: "Company not found" });

      await pool.query(
        "UPDATE companies SET status = $1, tariff_plan = $2, settings = $3 WHERE id = $4",
        [
          status || company.status,
          tariff_plan || company.tariff_plan,
          settings ? JSON.stringify(settings) : company.settings,
          companyId
        ]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Update failed" });
    }
  });

  app.get("/api/admin/stats", authenticate, async (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: "Forbidden" });
    
    try {
      const [companiesRes, pendingRes, usersRes, logsRes] = await Promise.all([
        pool.query("SELECT COUNT(*) FROM companies"),
        pool.query("SELECT COUNT(*) FROM companies WHERE status = 'PENDING'"),
        pool.query("SELECT COUNT(*) FROM users"),
        pool.query("SELECT COUNT(*) FROM logs")
      ]);

      res.json({
        totalCompanies: parseInt(companiesRes.rows[0].count),
        pendingCompanies: parseInt(pendingRes.rows[0].count),
        totalUsers: parseInt(usersRes.rows[0].count),
        totalLogs: parseInt(logsRes.rows[0].count),
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.post("/api/companies", authenticate, async (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: "Forbidden" });
    const { name, reg_number, address, industry_type, responsible_person } = req.body;
    
    try {
      const { rows } = await pool.query(
        "INSERT INTO companies (name, reg_number, address, industry_type, responsible_person) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [name, reg_number, address, industry_type, responsible_person]
      );
      res.json({ id: rows[0].id });
    } catch (err) {
      res.status(500).json({ error: "Failed to create company" });
    }
  });

  // User Management (Company Admin)
  app.get("/api/users", authenticate, async (req: any, res) => {
    const companyId = req.user.company_id;
    if (!companyId && req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: "Forbidden" });
    
    try {
      let query = "SELECT id, name, email, role, company_id, is_active FROM users";
      let params: any[] = [];
      
      if (req.user.role !== 'SUPER_ADMIN') {
        query += " WHERE company_id = $1";
        params.push(companyId);
      }
      
      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/users", authenticate, async (req: any, res) => {
    const { name, email, password, role, company_id } = req.body;
    
    if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'COMPANY_ADMIN') {
      return res.status(403).json({ error: "Forbidden" });
    }

    const targetCompanyId = req.user.role === 'SUPER_ADMIN' ? (company_id || null) : req.user.company_id;
    const hash = bcrypt.hashSync(password, 10);
    
    try {
      const { rows } = await pool.query(
        "INSERT INTO users (name, email, password_hash, role, company_id, is_active) VALUES ($1, $2, $3, $4, $5, true) RETURNING id",
        [name, email, hash, role, targetCompanyId]
      );
      res.json({ id: rows[0].id });
    } catch (err: any) {
      console.error("Error creating user:", err);
      res.status(400).json({ error: err.message.includes('unique') ? "Email already exists" : "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", authenticate, async (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'COMPANY_ADMIN') {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { name, email, role, is_active, company_id } = req.body;
    const userId = req.params.id;

    try {
      const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
      const targetUser = rows[0];
      if (!targetUser) return res.status(404).json({ error: "User not found" });
      
      if (req.user.role !== 'SUPER_ADMIN' && targetUser.company_id !== req.user.company_id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      await pool.query(
        "UPDATE users SET name = $1, email = $2, role = $3, is_active = $4, company_id = $5 WHERE id = $6",
        [
          name || targetUser.name,
          email || targetUser.email,
          role || targetUser.role,
          is_active !== undefined ? is_active : targetUser.is_active,
          req.user.role === 'SUPER_ADMIN' ? (company_id !== undefined ? company_id : targetUser.company_id) : targetUser.company_id,
          userId
        ]
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error updating user:", err);
      res.status(400).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", authenticate, async (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'COMPANY_ADMIN') {
      return res.status(403).json({ error: "Forbidden" });
    }
    const userId = req.params.id;

    try {
      const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
      const targetUser = rows[0];
      if (!targetUser) return res.status(404).json({ error: "User not found" });
      
      if (req.user.role !== 'SUPER_ADMIN' && targetUser.company_id !== req.user.company_id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (userId === String(req.user.id)) {
        return res.status(400).json({ error: "Cannot delete yourself" });
      }

      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error deleting user:", err);
      res.status(400).json({ error: "Failed to delete user" });
    }
  });

  // Journal Templates
  app.get("/api/journals", authenticate, async (req: any, res) => {
    try {
      let query = "SELECT * FROM journals";
      let params: any[] = [];
      
      if (req.user.role !== 'SUPER_ADMIN') {
        query += " WHERE company_id = $1 OR company_id IS NULL";
        params.push(req.user.company_id);
      }
      
      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch journals" });
    }
  });

  app.post("/api/journals", authenticate, async (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'COMPANY_ADMIN' && req.user.role !== 'HACCP_MANAGER') {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { name, fields, company_id } = req.body;
    const targetCompanyId = req.user.role === 'SUPER_ADMIN' ? (company_id || null) : req.user.company_id;
    
    try {
      const { rows } = await pool.query(
        "INSERT INTO journals (company_id, name, fields) VALUES ($1, $2, $3) RETURNING id",
        [targetCompanyId, name, JSON.stringify(fields)]
      );
      res.json({ id: rows[0].id });
    } catch (err: any) {
      console.error("Error creating journal:", err);
      res.status(400).json({ error: "Failed to create journal" });
    }
  });

  // Logs
  app.get("/api/logs", authenticate, async (req: any, res) => {
    try {
      let query = `
        SELECT l.*, j.name as journal_name, u.name as user_name 
        FROM logs l
        JOIN journals j ON l.journal_id = j.id
        JOIN users u ON l.user_id = u.id
      `;
      let params: any[] = [];

      if (req.user.role !== 'SUPER_ADMIN') {
        query += " WHERE j.company_id = $1";
        params.push(req.user.company_id);
      }
      
      query += " ORDER BY l.created_at DESC";

      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  });

  app.post("/api/logs", authenticate, async (req: any, res) => {
    const { journal_id, data } = req.body;
    const companyId = req.user.company_id;
    
    try {
      // CCP Check logic
      const { rows: ccps } = await pool.query("SELECT * FROM ccp_definitions WHERE company_id = $1", [companyId]);

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

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const logRes = await client.query(
          "INSERT INTO logs (journal_id, user_id, data, status, deviation_notes) VALUES ($1, $2, $3, $4, $5) RETURNING id",
          [journal_id, req.user.id, JSON.stringify(data), status, deviation_notes]
        );
        const logId = logRes.rows[0].id;

        if (status === 'DEVIATION') {
          await client.query(
            "INSERT INTO corrective_actions (log_id, description) VALUES ($1, $2)",
            [logId, `Automated alert: ${deviation_notes}`]
          );
        }
        await client.query('COMMIT');
        res.json({ id: logId, status, deviation_notes });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to create log" });
    }
  });

  // Corrective Actions
  app.get("/api/corrective-actions", authenticate, async (req: any, res) => {
    try {
      let query = `
        SELECT ca.*, l.created_at as log_date, j.name as journal_name
        FROM corrective_actions ca
        JOIN logs l ON ca.log_id = l.id
        JOIN journals j ON l.journal_id = j.id
      `;
      let params: any[] = [];

      if (req.user.role !== 'SUPER_ADMIN') {
        query += " WHERE j.company_id = $1";
        params.push(req.user.company_id);
      }

      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch corrective actions" });
    }
  });

  app.post("/api/corrective-actions/:id/resolve", authenticate, async (req: any, res) => {
    const { id } = req.params;
    try {
      await pool.query(
        "UPDATE corrective_actions SET status = 'CLOSED', resolved_by = $1, resolved_at = CURRENT_TIMESTAMP WHERE id = $2",
        [req.user.id, id]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to resolve corrective action" });
    }
  });

  // CCP Definitions
  app.get("/api/ccps", authenticate, async (req: any, res) => {
    try {
      let query = "SELECT * FROM ccp_definitions";
      let params: any[] = [];
      if (req.user.role !== 'SUPER_ADMIN') {
        query += " WHERE company_id = $1";
        params.push(req.user.company_id);
      }
      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch CCPs" });
    }
  });

  // Backup Management
  app.get("/api/backups", authenticate, async (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: "Forbidden" });
    try {
      const { rows } = await pool.query("SELECT * FROM backups ORDER BY created_at DESC");
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch backups" });
    }
  });

  app.post("/api/backups/trigger", authenticate, async (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: "Forbidden" });
    try {
      await pool.query("INSERT INTO backups (filename) VALUES ($1)", [`manual-check-${Date.now()}`]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to trigger backup" });
    }
  });

  // HACCP Plans
  app.get("/api/haccp-plan", authenticate, async (req: any, res) => {
    const companyId = req.user.company_id;
    try {
      const { rows } = await pool.query("SELECT * FROM haccp_plans WHERE company_id = $1", [companyId]);
      let plan = rows[0];
      if (!plan) {
        const insertRes = await pool.query(
          `INSERT INTO haccp_plans (
            company_id, product_description, flow_diagram, hazard_analysis, 
            ccp_determination, critical_limits, monitoring_procedures, corrective_actions_plan
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [companyId, "Default Product Description", "[]", "[]", "[]", "[]", "[]", "[]"]
        );
        plan = insertRes.rows[0];
      }
      res.json(plan);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch HACCP plan" });
    }
  });

  app.post("/api/haccp-plan", authenticate, async (req: any, res) => {
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
    
    try {
      await pool.query(
        `UPDATE haccp_plans 
        SET product_description = $1, flow_diagram = $2, hazard_analysis = $3, 
            ccp_determination = $4, critical_limits = $5, monitoring_procedures = $6, 
            corrective_actions_plan = $7, plan_date = $8, plan_time = $9, 
            version = version + 1, updated_at = CURRENT_TIMESTAMP 
        WHERE company_id = $10`,
        [
          product_description, flow_diagram, hazard_analysis, ccp_determination, 
          critical_limits, monitoring_procedures, corrective_actions_plan, 
          plan_date, plan_time, targetCompanyId
        ]
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update HACCP plan" });
    }
  });

  // Handle 404 for API routes
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
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
