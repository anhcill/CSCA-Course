import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load .env ngay trong module này để đảm bảo DATABASE_URL có sẵn
dotenv.config({ path: path.resolve('backend', '.env') });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[pg-pool] Unexpected error:', err.message);
});

// Helper: chạy 1 query
export const query = (text, params) => pool.query(text, params);

// Helper: lấy client cho transaction
export const getClient = () => pool.connect();

export { pool };
