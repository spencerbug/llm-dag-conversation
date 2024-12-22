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

    // 1. Get the parent's summary (if parent_id is provided)
    let parentSummary = '';
    if (parent_id) {
        const parentResult = await pool.query(
            'SELECT summary FROM nodes where id = $1 and user_id = $2',
            [parent_id, user_id]
        )
        if (parentResult.rows.length > 0) {
            parentSummary = parentResult.rows[0].summary;
        }
    }

    // 2. Summarize new content with the parent's summary as context
    let summary = '';
    try {
        const summarizeRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/summarize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: `Past summary: ${parentSummary}\nNew content: ${content}`,
            }),
        })
        const summarizeData = await summarizeRes.json();
        if (!summarizeRes.ok || summarizeData.error) {
            console.error("Error in /api/summarize:", summarizeData.error);
            summary = ''; // fallback to empty summary
        } else {
            summary = summarizeData.summary;
        }
    } catch (error) {
        console.error("Error in /api/summarize:", error);
    }

    const client = await pool.connect();
    try {
        console.log(`SQL: INSERT INTO nodes (user_id, role, content, summary) VALUES (${user_id}, ${role}, ${content}, ${summary})`);
        await client.query('BEGIN');
        const nodeResult = await client.query(
            'INSERT INTO nodes (user_id, role, content, summary) VALUES ($1, $2, $3, $4) RETURNING id;',
            [user_id, role, content, summary]
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