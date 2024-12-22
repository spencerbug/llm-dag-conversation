import { NextRequest, NextResponse } from "next/server";

export async function POST(req:NextRequest) {
    try {
        const { content } = await req.json();
        if (!content || typeof content !== 'string') {
            return NextResponse.json({ error: 'Invalid content' }, { status: 400 });
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions',{
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{ 
                    role: 'user', 
                    content: `Summarize the new content in 5 words or less, in context of previous summaries\n\n${content}`
                 }],
                max_tokens: 50
            }),
        });

        const data = await response.json();
        if (data.error) {
            return NextResponse.json({ error: data.error }, { status: 500 });
        }

        const summary = data.choices[0].message?.content?.trim() || '';
        return NextResponse.json({summary});
    } catch (error) {
        console.error('Error in /api/summarize:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}