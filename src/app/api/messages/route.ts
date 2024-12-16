import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: NextRequest) {
  const { role, content, parent_id } = await req.json();
  if (!role || !content) {
    return NextResponse.json({ error: 'role and content are required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nodeResult = await client.query(
        'INSERT INTO nodes (role, content) VALUES ($1, $2) RETURNING id;',
        [role, content]
    );
    const newNodeId = nodeResult.rows[0].id;

    if (parent_id) {
        await client.query(
            'INSERT INTO edges (parent_id, child_id) VALUES ($1, $2);',
            [parent_id, newNodeId]
        );
    }
    await client.query('COMMIT');
    return NextResponse.json({ id: newNodeId }, { status: 201 });
  } catch (error) {
    await client.query('ROLLBACK');
    const errorMessage = error instanceof Error ? error.message : 'database error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  } finally {
    client.release();
  }
}