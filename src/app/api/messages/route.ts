import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET() {
  const { rows } = await pool.query('SELECT * FROM nodes ORDER BY created_at ASC;');
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { role, content } = await req.json();
  if (!role || !content) {
    return NextResponse.json({ error: 'role and content are required' }, { status: 400 });
  }
  const { rows } = await pool.query(
    'INSERT INTO nodes (role, content) VALUES ($1, $2) RETURNING *;',
    [role, content]
  );
  return NextResponse.json(rows[0], { status: 201 });
}