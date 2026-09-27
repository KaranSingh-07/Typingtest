import { Pool } from 'pg';

export const pool = new Pool({
  user: process.env.POSTGRES_USER || 'typing_user',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || 'typing_test',
  password: process.env.POSTGRES_PASSWORD || 'typing_password',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
