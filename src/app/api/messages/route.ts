import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { Session } from "next-auth";
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: NextRequest) {
    const session: Session | null = await getServerSession({ req, ...authOptions });
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { role, content, parent_id } = await req.json();
    if (!role || !content) {
        return NextResponse.json({ error: 'role and content are required' }, { status: 400 });
    }
    const user_id = session.user.id;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const nodeResult = await client.query(
            'INSERT INTO nodes (user_id, role, content) VALUES ($1, $2, $3) RETURNING id;',
            [user_id, role, content]
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