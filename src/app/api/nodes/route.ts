import { NextResponse, NextRequest } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export async function GET() {
    const nodesQuery = 'SELECT * FROM nodes ORDER BY id ASC;';
    const edgesQuery = 'SELECT * FROM edges';

    const [nodesResult, edgesResult] = await Promise.all([
        pool.query(nodesQuery),
        pool.query(edgesQuery)
    ]);

    return NextResponse.json({
        nodes: nodesResult.rows,
        edges: edgesResult.rows
    });
}

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const nodeId = searchParams.get('id');
  
    const client = await pool.connect();
    try {
      if (nodeId) {
        // Delete individual node and its edges
        await client.query('BEGIN');
        await client.query('DELETE FROM edges WHERE parent_id = $1 OR child_id = $1;', [nodeId]);
        await client.query('DELETE FROM nodes WHERE id = $1;', [nodeId]);
        await client.query('COMMIT');
        return NextResponse.json({ message: `Node ${nodeId} deleted` });
      } else {
        // Delete all nodes and edges
        await client.query('BEGIN');
        await client.query('DELETE FROM edges;');
        await client.query('DELETE FROM nodes;');
        await client.query('COMMIT');
        return NextResponse.json({ message: 'All nodes deleted' });
      }
    } catch (error) {
      await client.query('ROLLBACK');
      const errorMessage = error instanceof Error ? error.message : 'database error';
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    } finally {
      client.release();
    }
  }