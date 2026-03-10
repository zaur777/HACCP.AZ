import { GoogleGenAI, Type } from "@google/genai";
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
import http from "http";
import { WebSocketServer, WebSocket } from "ws";

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

async function seedInitialData() {
  try {
    console.log("Checking for initial data in database...");
    
    // Seed Super Admin
    const { rows: adminRows } = await pool.query("SELECT id FROM users WHERE email = $1", ["admin@safefood.com"]);
    if (adminRows.length === 0) {
      console.log("Super Admin not found. Seeding...");
      const hash = bcrypt.hashSync("admin123", 10);
      await pool.query(
        "INSERT INTO users (email, password_hash, name, role, is_active) VALUES ($1, $2, $3, $4, $5)",
        ["admin@safefood.com", hash, "Super Admin", "SUPER_ADMIN", true]
      );
      console.log("Super Admin seeded: admin@safefood.com / admin123");
    }

    // Seed FreshBite Manager
    const { rows: managerRows } = await pool.query("SELECT id FROM users WHERE email = $1", ["manager@freshbite.com"]);
    if (managerRows.length === 0) {
      console.log("FreshBite Manager not found. Seeding...");
      
      // Create FreshBite Company first
      const { rows: companyRows } = await pool.query("SELECT id FROM companies WHERE name = $1", ["FreshBite"]);
      let companyId;
      if (companyRows.length === 0) {
        const insertCompany = await pool.query(
          "INSERT INTO companies (name, industry_type, status) VALUES ($1, $2, $3) RETURNING id",
          ["FreshBite", "Catering", "APPROVED"]
        );
        companyId = insertCompany.rows[0].id;
        console.log("FreshBite Company created.");
      } else {
        companyId = companyRows[0].id;
      }

      const hash = bcrypt.hashSync("manager123", 10);
      await pool.query(
        "INSERT INTO users (company_id, email, password_hash, name, role, is_active) VALUES ($1, $2, $3, $4, $5, $6)",
        [companyId, "manager@freshbite.com", hash, "FreshBite Manager", "COMPANY_ADMIN", true]
      );
      console.log("FreshBite Manager seeded: manager@freshbite.com / manager123");
    }
  } catch (err) {
    console.error("Initial data seeding failed:", err);
  }
}

async function runMigrations() {
  try {
    console.log("Running migrations...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER REFERENCES users(id) NOT NULL,
        receiver_id INTEGER REFERENCES users(id),
        company_id INTEGER REFERENCES companies(id),
        content TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id) NOT NULL,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'AZN',
        tariff_plan VARCHAR(50) NOT NULL,
        duration_months INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'COMPLETED',
        payment_method VARCHAR(50) DEFAULT 'CARD',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    await pool.query(`
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS tariff_duration_months INTEGER;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone_number TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS facility_addresses TEXT;
    `);
    
    console.log("Migrations completed.");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

async function startServer() {
  console.log("Starting server...");
  await runMigrations();
  await seedInitialData();
  
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  // WebSocket Chat Logic
  const clients = new Map<number, WebSocket>();

  wss.on("connection", (ws, req) => {
    const cookies = req.headers.cookie;
    if (!cookies) return ws.close();
    
    const token = cookies.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
    if (!token) return ws.close();

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const userId = decoded.id;
      clients.set(userId, ws);

      ws.on("message", async (data) => {
        const message = JSON.parse(data.toString());
        const { receiverId, content, companyId } = message;

        // Save to DB
        const { rows } = await pool.query(
          "INSERT INTO messages (sender_id, receiver_id, company_id, content) VALUES ($1, $2, $3, $4) RETURNING *",
          [userId, receiverId || null, companyId || null, content]
        );
        const savedMsg = rows[0];

        // Broadcast to receiver if online
        if (receiverId && clients.has(receiverId)) {
          clients.get(receiverId)?.send(JSON.stringify(savedMsg));
        }
        
        // If it's a message to super admin, broadcast to all super admins online
        if (!receiverId) {
          const { rows: admins } = await pool.query("SELECT id FROM users WHERE role = 'SUPER_ADMIN'");
          admins.forEach(admin => {
            if (clients.has(admin.id)) {
              clients.get(admin.id)?.send(JSON.stringify(savedMsg));
            }
          });
        }
      });

      ws.on("close", () => {
        clients.delete(userId);
      });
    } catch (err) {
      ws.close();
    }
  });

  app.get("/api/ping", (req, res) => {
    res.send("pong");
  });

  // Run migrations and seeding
  await runMigrations();
  seedInitialData().catch(err => console.error("Background seeding failed:", err));

  app.use(express.json());
  app.use(cookieParser());

  // Remove trailing slashes from all requests
  app.use((req, res, next) => {
    if (req.path.length > 1 && req.path.endsWith('/')) {
      const query = req.url.slice(req.path.length);
      const safepath = req.path.slice(0, -1);
      req.url = safepath + query;
    }
    next();
  });

  // Request Logger for API
  app.use("/api/*", (req, res, next) => {
    console.log(`[API] ${req.method} ${req.url}`);
    next();
  });

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
    console.log(`[AUTH] POST /api/auth/login request received`);
    const { email, password } = req.body;
    console.log(`[AUTH] Login attempt for: ${email}`);
    
    try {
      const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
      const user = rows[0];

      if (!user) {
        console.log(`[AUTH] User not found: ${email}`);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
      console.log(`[AUTH] Password valid for ${email}: ${isPasswordValid}`);

      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Check company status if not super admin
      let companyStatus = 'APPROVED';
      if (user.role !== 'SUPER_ADMIN' && user.company_id) {
        console.log(`[AUTH] Checking company status for company_id: ${user.company_id}`);
        const { rows: companyRows } = await pool.query("SELECT status FROM companies WHERE id = $1", [user.company_id]);
        const company = companyRows[0];

        if (company) {
          companyStatus = company.status;
          console.log(`[AUTH] Company status for ${user.company_id}: ${companyStatus}`);
          if (company.status === 'SUSPENDED') {
            return res.status(403).json({ error: "Your company account has been suspended." });
          }
        } else {
          console.log(`[AUTH] Company not found for company_id: ${user.company_id}`);
        }
      }

      console.log(`[AUTH] Login successful for: ${email}. Generating token...`);
      const token = jwt.sign({ id: user.id, company_id: user.company_id, role: user.role, company_status: companyStatus }, JWT_SECRET, { expiresIn: "24h" });
      res.cookie("token", token, { httpOnly: true, secure: true, sameSite: "none" });
      console.log(`[AUTH] Cookie set. Sending response for: ${email}`);
      res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, company_id: user.company_id, company_status: companyStatus } });
    } catch (err: any) {
      console.error("[AUTH] Login error:", err);
      res.status(500).json({ error: "Login failed", details: err.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ success: true });
  });

  app.post("/api/auth/register-company", async (req, res) => {
    const { 
      companyName, 
      regNumber, 
      address, 
      responsiblePerson, 
      adminName, 
      adminEmail, 
      adminPassword, 
      confirmPassword, 
      industryType,
      tariffPlan,
      tariffDuration
    } = req.body;
    
    console.log(`Registration attempt for company: ${companyName}, admin: ${adminEmail}, plan: ${tariffPlan}`);

    try {
      if (!companyName || !adminName || !adminEmail || !adminPassword || !tariffPlan) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      if (adminPassword !== confirmPassword) {
        return res.status(400).json({ error: "Passwords do not match" });
      }

      const { rows: existingUsers } = await pool.query("SELECT id FROM users WHERE email = $1", [adminEmail]);
      if (existingUsers.length > 0) {
        return res.status(400).json({ error: "Email already registered" });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + (tariffDuration || 1) + 1);

        const companyRes = await client.query(
          `INSERT INTO companies (name, reg_number, address, industry_type, responsible_person, status, tariff_plan, tariff_duration_months, subscription_expires_at) 
           VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8) RETURNING id`,
          [companyName, regNumber || null, address || null, industryType, responsiblePerson || null, tariffPlan, (tariffDuration || 1) + 1, expiresAt]
        );
        const companyId = companyRes.rows[0].id;

        const hash = bcrypt.hashSync(adminPassword, 10);
        const userRes = await client.query(
          "INSERT INTO users (company_id, email, password_hash, name, role, is_active) VALUES ($1, $2, $3, $4, 'COMPANY_ADMIN', true) RETURNING id",
          [companyId, adminEmail, hash, adminName]
        );
        const userId = userRes.rows[0].id;

        // Record initial payment
        const getTariffPrice = (m: number) => {
          if (m === 1) return 30;
          if (m === 6) return 150;
          if (m === 12) return 240;
          return m * 30;
        };
        const amount = getTariffPrice(tariffDuration || 1);
        
        await client.query(
          "INSERT INTO payments (company_id, user_id, amount, tariff_plan, duration_months) VALUES ($1, $2, $3, $4, $5)",
          [companyId, userId, amount, tariffPlan, tariffDuration || 1]
        );

        // Create initial HACCP plan
        await client.query(
          "INSERT INTO haccp_plans (company_id, product_description) VALUES ($1, $2)",
          [companyId, `Initial HACCP plan for ${companyName}`]
        );

        await client.query('COMMIT');
        console.log(`Registration successful for ${companyName}`);
        res.json({ success: true, message: "Registration successful. Waiting for approval." });
      } catch (err) {
        await client.query('ROLLBACK');
        console.error("Transaction failed:", err);
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error("Registration error:", err);
      res.status(500).json({ error: "Registration failed: " + (err.message || "Unknown error") });
    }
  });

  app.get("/api/auth/me", authenticate, async (req: any, res) => {
    try {
      const { rows } = await pool.query("SELECT id, name, email, role, company_id FROM users WHERE id = $1", [req.user.id]);
      const user = rows[0];
      if (!user) return res.status(404).json({ error: "User not found" });

      let companyInfo = {};
      if (user.role !== 'SUPER_ADMIN' && user.company_id) {
        const { rows: companyRows } = await pool.query(
          "SELECT status, subscription_expires_at, name as company_name, industry_type, reg_number, address, phone_number, facility_addresses FROM companies WHERE id = $1", 
          [user.company_id]
        );
        if (companyRows[0]) {
          companyInfo = {
            company_status: companyRows[0].status,
            subscription_expires_at: companyRows[0].subscription_expires_at,
            company_name: companyRows[0].company_name,
            industry_type: companyRows[0].industry_type,
            reg_number: companyRows[0].reg_number,
            address: companyRows[0].address,
            phone_number: companyRows[0].phone_number,
            facility_addresses: companyRows[0].facility_addresses
          };
        }
      }

      res.json({ user: { ...user, ...companyInfo } });
    } catch (err) {
      console.error("Auth check error:", err);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.patch("/api/auth/profile", authenticate, async (req: any, res) => {
    const { name, email, password, company_name, industry_type, reg_number, address, phone_number, facility_addresses } = req.body;
    try {
      // Update user info
      let userQuery = "UPDATE users SET name = $1, email = $2";
      let userParams = [name, email, req.user.id];
      
      if (password) {
        const hash = bcrypt.hashSync(password, 10);
        userQuery += ", password_hash = $4 WHERE id = $3";
        userParams.push(hash);
      } else {
        userQuery += " WHERE id = $3";
      }
      
      await pool.query(userQuery, userParams);

      // Update company info if applicable
      if (req.user.company_id && (req.user.role === 'COMPANY_ADMIN' || req.user.role === 'HACCP_MANAGER')) {
        await pool.query(
          `UPDATE companies SET 
            name = $1, 
            industry_type = $2, 
            reg_number = $3, 
            address = $4, 
            phone_number = $5, 
            facility_addresses = $6 
          WHERE id = $7`,
          [company_name, industry_type, reg_number, address, phone_number, facility_addresses, req.user.company_id]
        );
      }
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message.includes('unique') ? "Email already exists" : "Update failed" });
    }
  });

  // Subscription / Tariff Routes
  app.post("/api/companies/:id/subscription", authenticate, async (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'COMPANY_ADMIN') {
      return res.status(403).json({ error: "Forbidden" });
    }
    
    const { months, plan } = req.body;
    const companyId = req.params.id;
    
    try {
      const { rows } = await pool.query("SELECT subscription_expires_at FROM companies WHERE id = $1", [companyId]);
      let currentExpires = rows[0]?.subscription_expires_at ? new Date(rows[0].subscription_expires_at) : new Date();
      if (currentExpires < new Date()) currentExpires = new Date();
      
      currentExpires.setMonth(currentExpires.getMonth() + months);
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        await client.query(
          "UPDATE companies SET tariff_plan = $1, tariff_duration_months = $2, subscription_expires_at = $3 WHERE id = $4",
          [plan, months, currentExpires, companyId]
        );

        const getTariffPrice = (m: number) => {
          if (m === 1) return 30;
          if (m === 6) return 150;
          if (m === 12) return 240;
          return m * 30;
        };
        const amount = getTariffPrice(months);

        await client.query(
          "INSERT INTO payments (company_id, user_id, amount, tariff_plan, duration_months) VALUES ($1, $2, $3, $4, $5)",
          [companyId, req.user.id, amount, plan, months]
        );

        await client.query('COMMIT');
        res.json({ success: true, expiresAt: currentExpires });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to update subscription" });
    }
  });

  app.get("/api/payments", authenticate, async (req: any, res) => {
    try {
      let query = `
        SELECT p.*, c.name as company_name, u.name as user_name 
        FROM payments p
        JOIN companies c ON p.company_id = c.id
        JOIN users u ON p.user_id = u.id
      `;
      const params: any[] = [];

      if (req.user.role !== 'SUPER_ADMIN') {
        query += " WHERE p.company_id = $1";
        params.push(req.user.company_id);
      }

      query += " ORDER BY p.created_at DESC";

      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  // Chat Routes
  app.get("/api/messages", authenticate, async (req: any, res) => {
    const companyId = req.user.company_id;
    try {
      let query = `
        SELECT m.*, u.name as sender_name, u.role as sender_role 
        FROM messages m
        JOIN users u ON m.sender_id = u.id
      `;
      let params: any[] = [];

      if (req.user.role !== 'SUPER_ADMIN') {
        query += " WHERE m.company_id = $1 OR m.receiver_id = $2";
        params.push(companyId, req.user.id);
      }
      
      query += " ORDER BY m.created_at ASC";
      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch messages" });
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

  app.get("/api/backups/:id/download", authenticate, async (req: any, res) => {
    if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: "Forbidden" });
    const { id } = req.params;
    try {
      const { rows: backupRows } = await pool.query("SELECT * FROM backups WHERE id = $1", [id]);
      if (backupRows.length === 0) return res.status(404).json({ error: "Backup not found" });

      // Generate a mock backup file content
      const companies = await pool.query("SELECT * FROM companies");
      const users = await pool.query("SELECT * FROM users");
      const journals = await pool.query("SELECT * FROM journals");
      const logs = await pool.query("SELECT * FROM logs");

      const backupData = {
        timestamp: new Date().toISOString(),
        backup_id: id,
        data: {
          companies: companies.rows,
          users: users.rows,
          journals: journals.rows,
          logs: logs.rows
        }
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=${backupRows[0].filename}.json`);
      res.send(JSON.stringify(backupData, null, 2));
    } catch (err) {
      res.status(500).json({ error: "Failed to download backup" });
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

  // Chat Routes

  // Handle 404 for API routes
  app.all("/api/*", (req, res) => {
    console.log(`[API 404] ${req.method} ${req.url}`);
    res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
  });

  // Catch-all for any other unhandled requests
  // Removed noisy logging that was confusing users
  
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

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({ 
      error: "Internal Server Error", 
      message: err.message || "An unexpected error occurred" 
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
