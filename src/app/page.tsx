'use client';

import { useState, useEffect } from 'react';

export default function Home() {
    const [messages, setMessages] = useState<any[]>([]);
    const [input, setInput] = useState('');


    useEffect(() => {
        fetch('/api/messages')
        .then(res => res.json())
        .then(data => setMessages(data));
    }, []);

    const sendMessage = async () => {
        const userMsgRes = await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'user', content: input })
        });
        const userMsg = await userMsgRes.json();

        // Call LLM API
        const llmRes = await fetch('/api/llm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: input })
        });
        const llmMsg = await llmRes.json();

        if (llmMsg.error) {
          console.error(llmMsg.error);
          return
        }

        // Ensure llmMsg.content is defined
        if (!llmMsg.content) {
          console.error('LLM returned no content');
          return;
        }
        
        // add assistant message
        await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'assistant', content: llmMsg.content })
        });

        // refresh messages
        const updated = await (await fetch('/api/messages')).json();
        setMessages(updated);
        setInput('');
    };


    return (
        <div style={{ padding: '20px' }}>
            <h1>DAG LLM Experiment</h1>
            <div style={{border: '1px solid #ccc', padding: '10px', maxWidth: '600px', marginBottom: '20px'}}>
            {messages.map(msg => (
                <div key={msg.id}>
                <strong>{msg.role.toUpperCase()}:</strong> {msg.content}
                </div>
            ))}
            </div>
            <input 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{marginRight: '10px'}}
            />
            <button onClick={sendMessage}>Send</button>
        </div>
    );
}