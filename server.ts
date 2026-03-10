import { GoogleGenAI, Type } from "@google/genai";
import express from "express";
import { createServer as createViteServer } from "vite";
import pkg from "pg";
const { Pool } = pkg;
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import cors from "cors"; // Added CORS
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  host: process.env.DB_HOST || "31.220.80.185",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "haccp_az",
  user: process.env.DB_USER || "haccp_az",
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
});

const JWT_SECRET = process.env.JWT_SECRET || "haccp-secret-key-123";

async function runMigrations() {
  try {
    console.log("Running migrations...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        reg_number TEXT,
        address TEXT,
        industry_type TEXT,
        responsible_person TEXT,
        status TEXT DEFAULT 'PENDING',
        tariff_plan TEXT,
        tariff_duration_months INTEGER,
        subscription_expires_at TIMESTAMPTZ,
        phone_number TEXT,
        facility_addresses TEXT,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS journals (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        name TEXT NOT NULL,
        fields JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        journal_id INTEGER REFERENCES journals(id) NOT NULL,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        data JSONB NOT NULL,
        status TEXT DEFAULT 'APPROVED',
        deviation_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

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
    console.log("Migrations completed.");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

async function seedInitialData() {
  try {
    const { rows: adminRows } = await pool.query("SELECT id FROM users WHERE email = $1", ["admin@safefood.com"]);
    if (adminRows.length === 0) {
      const hash = bcrypt.hashSync("admin123", 10);
      await pool.query(
        "INSERT INTO users (email, password_hash, name, role, is_active) VALUES ($1, $2, $3, $4, $5)",
        ["admin@safefood.com", hash, "Super Admin", "SUPER_ADMIN", true]
      );
      console.log("Super Admin seeded.");
    }
  } catch (err) {
    console.error("Seeding failed:", err);
  }
}

async function startServer() {
  await runMigrations();
  await seedInitialData();

  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  // Middleware
  app.use(cors({
    origin: "https://haccp.az",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  }));
  app.use(express.json());
  app.use(cookieParser());

  // WebSocket Logic
  const clients = new Map<number, WebSocket>();
  wss.on("connection", (ws, req) => {
    const token = req.headers.cookie?.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1];
    if (!token) return ws.close();
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      clients.set(decoded.id, ws);
      ws.on("close", () => clients.delete(decoded.id));
    } catch { ws.close(); }
  });

  // Auth Routes
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    try {
      const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
      const user = rows[0];
      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign({ id: user.id, company_id: user.company_id, role: user.role }, JWT_SECRET, { expiresIn: "24h" });
      res.cookie("token", token, { httpOnly: true, secure: true, sameSite: "none" });
      res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, company_id: user.company_id } });
    } catch (err) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/auth/me", async (req: any, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const { rows } = await pool.query("SELECT id, name, email, role, company_id FROM users WHERE id = $1", [decoded.id]);
      res.json({ user: rows[0] });
    } catch { res.status(401).json({ error: "Invalid token" }); }
  });

  // Admin Stats
  app.get("/api/admin/stats", async (req, res) => {
    try {
      const [companies, pending, users, logs] = await Promise.all([
        pool.query("SELECT COUNT(*) FROM companies"),
        pool.query("SELECT COUNT(*) FROM companies WHERE status = 'PENDING'"),
        pool.query("SELECT COUNT(*) FROM users"),
        pool.query("SELECT COUNT(*) FROM logs")
      ]);
      res.json({
        totalCompanies: parseInt(companies.rows[0].count),
        pendingCompanies: parseInt(pending.rows[0].count),
        totalUsers: parseInt(users.rows[0].count),
        totalLogs: parseInt(logs.rows[0].count),
      });
    } catch (err) { res.status(500).json({ error: "Stats failed" }); }
  });

  server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
  });
}

startServer();
