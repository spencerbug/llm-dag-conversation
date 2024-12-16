import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "chatgpt-4o-latest",
      messages: [
        { "role": "system", "content": "You are a helpful assistant." },
        { "role": "user", "content": prompt }
      ],
      max_tokens: 150
    })
  });

  const data = await response.json();
  if (data.error) {
    return NextResponse.json({ error: data.error.message }, { status: 500 });
  }

  if (!data.choices || data.choices.length === 0 || !data.choices[0].message) {
    return NextResponse.json({ error: 'No response from LLM' }, { status: 500 });
  }

  const assistantMessage = data.choices[0].message.content;
  if (!assistantMessage) {
    return NextResponse.json({ error: 'LLM message content is empty' }, { status: 500 });
  }

  return NextResponse.json({ content: assistantMessage });
}
