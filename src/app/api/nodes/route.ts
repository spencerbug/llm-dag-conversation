// src/app/api/nodes/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { Pool } from 'pg';
import { Session } from 'next-auth';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(req: NextRequest) {
  const session: Session | null = await getServerSession({ req, ...authOptions });
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user_id = session.user.id;
  const nodesQuery = 'SELECT * FROM nodes WHERE user_id = $1 ORDER BY id ASC;';
  const edgesQuery = 'SELECT e.* FROM edges e JOIN nodes n ON n.id = e.parent_id WHERE n.user_id = $1';

  const [nodesResult, edgesResult] = await Promise.all([
    pool.query(nodesQuery, [user_id]),
    pool.query(edgesQuery, [user_id])
  ]);

  return NextResponse.json({
    nodes: nodesResult.rows,
    edges: edgesResult.rows
  });
}

export async function DELETE(req: NextRequest) {
  const session: Session | null = await getServerSession({ req, ...authOptions });
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user_id = session.user.id; // Updated to use user.id
  const { searchParams } = new URL(req.url);
  const nodeId = searchParams.get('id');

  const client = await pool.connect();
  try {
    if (nodeId) {
      // Delete individual node and its edges
      await client.query('BEGIN');

      // Delete associated edges
      await client.query(
        `
        DELETE FROM edges
        USING nodes
        WHERE edges.parent_id = nodes.id
          AND (edges.parent_id = $2 OR edges.child_id = $2)
          AND nodes.user_id = $1;
        `,
        [user_id, nodeId]
      );

      // Delete the node
      const deleteNodeResult = await client.query(
        `
        DELETE FROM nodes
        WHERE user_id = $1
          AND id = $2
        RETURNING *;
        `,
        [user_id, nodeId]
      );

      if (deleteNodeResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: 'Node not found or unauthorized' }, { status: 404 });
      }

      await client.query('COMMIT');
      return NextResponse.json({ message: `Node ${nodeId} deleted` });
    } else {
      // Delete all nodes and edges for the user
      await client.query('BEGIN');

      // Delete associated edges
      await client.query(
        `
        DELETE FROM edges
        USING nodes
        WHERE (edges.parent_id = nodes.id OR edges.child_id = nodes.id)
          AND nodes.user_id = $1;
        `,
        [user_id]
      );

      // Delete all nodes
      await client.query(
        `
        DELETE FROM nodes
        WHERE user_id = $1;
        `,
        [user_id]
      );

      await client.query('COMMIT');
      return NextResponse.json({ message: 'All nodes deleted' });
    }
  } catch (error) {
    await client.query('ROLLBACK');
    const errorMessage = error instanceof Error ? error.message : 'Database error';
    console.error('Error deleting nodes:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  } finally {
    client.release();
  }
}