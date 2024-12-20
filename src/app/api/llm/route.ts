import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../api/auth/[...nextauth]/route';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function getAncestors(nodeId: number, user_id: string) {
  const query = `
    WITH RECURSIVE ancestors AS (
      SELECT * FROM nodes WHERE id = $1
      UNION ALL
      SELECT n.*
      FROM edges e
      JOIN ancestors a ON a.id = e.child_id
      JOIN nodes n ON n.id = e.parent_id
      WHERE n.user_id = $2
    )
    SELECT * FROM ancestors ORDER BY id ASC;
  `;
  try {
    const { rows } = await pool.query(query, [nodeId, user_id]);
    return rows;
  } catch (error) {
    console.error('Error in getAncestors:', error);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession({req, ...authOptions});

  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user_id = session.user.id;

  try {
    const { nodeId } = await req.json();

    const ancestors = await getAncestors(nodeId, user_id);
    const messages = ancestors.map(node => ({
      role: node.role,
      content: node.content,
    }));

    // Validate and log messages
    for (const msg of messages) {
      if (!msg.content || typeof msg.content !== 'string' || msg.content.trim() === '') {
        console.error('Invalid message content:', msg);
        return NextResponse.json(
          { error: `Invalid content for message with role '${msg.role}'.` },
          { status: 400 }
        );
      }
    }

    // Log the messages array
    console.log('Messages to OpenAI:', messages);

    // Call the OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'chatgpt-4o-latest', // Use 'gpt-3.5-turbo' or 'gpt-4' if available
        messages: messages,
        max_tokens: 150,
      }),
    });

    const data = await response.json();
    if (data.error) {
      console.error('OpenAI API Error:', data.error);
      return NextResponse.json({ error: data.error.message }, { status: 500 });
    }

    const assistantMessage = data.choices[0]?.message?.content;
    if (!assistantMessage) {
      return NextResponse.json(
        { error: 'LLM message content is empty' },
        { status: 500 }
      );
    }

    return NextResponse.json({ content: assistantMessage });
  } catch (error) {
    console.error('Error in /api/llm POST:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}