// src/app/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

type NodeData = {
  id: number;
  parent_id?: number | null;
  role: string;
  content: string;
  summary: string;
};

export default function Home() {
  const { data: session, status } = useSession();
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<number | null>(null);
  const [input, setInput] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('localNodes');
    if (stored) setNodes(JSON.parse(stored));
    if (session) fetchNodesAndEdges();
  }, [session]);

  // save to localStorage whenever nodes change
  useEffect(() => {
    localStorage.setItem('localNodes', JSON.stringify(nodes));
  }, [nodes])

  const fetchNodesAndEdges = async () => {
    const res = await fetch('/api/nodes');
    const data = await res.json();
    setNodes(data.nodes);
    setEdges(data.edges);
  };

  const buildSummaryChain = (parentId: number | null) => {
    const chain: string[] = [];
    let current = nodes.find(n=>n.id === parentId);
    while (current) {
      chain.push(current.summary);
      current = nodes.find(n=>n.id === (current.parent_id || 0));
    }
    return chain.reverse().join('\n')
  };

  // creates node locally and in the db
  const createNode = async (role: string, content: string, parentId: number | null) => {
    const previousSummaries = buildSummaryChain(parentId)
    let summary = ''
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `All previous summaries:\n${previousSummaries}\n\nNew content:\n${content}`,
        }),
      })
      const data = await res.json();
      if (res.ok && !data.error) {
        summary = data.summary;
      }
    } catch(error) {
      console.error('Error calling /api/summarize:', error);
    }

    // single insert to DB (role, content summary)
    const nodeRes = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content, parent_id: parentId })
    })
    const nodeData = await nodeRes.json();
    const newId = nodeData.id

    // add node to local state & local storage immediately
    const newNode: NodeData = {
      id: newId,
      parent_id: parentId,
      role,
      content,
      summary
    };
    setNodes(prev => [...prev, newNode]);
    if (parentId) {
      setEdges( prev => [...prev, { parent_id: parentId, child_id: newId }  ] )
    }
    return newId;
  };


  const sendMessage = async () => {
    if (!input.trim()) return;
    // Create user node locally + DB
    const userNodeId = await createNode('user', input, currentNodeId)

    // Request LLM response
    const llmResponse = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: userNodeId }),
    });

    const llmData = await llmResponse.json();
    if (llmData.error) {
      console.error(llmData.error);
      return;
    }

    // create assistant node with LLM content
    const assistantNodeId = await createNode('assistant', llmData.content, userNodeId);
    setCurrentNodeId(assistantNodeId);
    setInput('');  
  };


  // Basic UI
  if (status === 'loading') return <div>Loading...</div>;
  if (!session) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>Please Sign In</h1>
        <Link href="/login"><button>Login</button></Link>
        <Link href="/register"><button>Register</button></Link>
      </div>
    );
  }

  const deleteNode = async (nodeId: number | null) => {
    const url = nodeId !== null ? `/api/nodes?id=${nodeId}` : '/api/nodes';
    await fetch(url, { method: 'DELETE' });
    await fetchNodesAndEdges();
    if (nodeId === currentNodeId) {
      setCurrentNodeId(null);
    }
  };

  const handleContinueFromNode = (nodeId: number) => {
    setCurrentNodeId(nodeId);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') sendMessage();
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>DAG LLM Experiment</h1>
      <div>
        <h2>Nodes</h2>
        <button onClick={() => setCurrentNodeId(null)} style={buttonStyle}>
          Clear current node
        </button>
        {nodes.map((node) => (
          <div key={node.id} style={nodeStyle}>
            <strong>{node.role.toUpperCase()} ({node.id}):</strong> {node.content}
            {node.summary && <p style={{ fontStyle: 'italic' }}>Summary: {node.summary}</p>}
            <button onClick={() => handleContinueFromNode(node.id)} style={smallButtonStyle}>
              Continue
            </button>
            <button onClick={() => deleteNode(node.id)} style={smallButtonStyle}>
              Delete
            </button>
          </div>
        ))}
      </div>

      <div>
        <h2>Edges</h2>
        {nodes.filter((n) => !edges.some((e) => e.child_id === n.id)).map((n) => (
          <div key={`root-${n.id}`} style={edgeStyle}>
            {'-> '}<strong>{n.id}</strong>
          </div>
        ))}
        {edges.map((edge) => (
          <div key={`${edge.parent_id}-${edge.child_id}`} style={edgeStyle}>
            <strong>{edge.parent_id}</strong> {'-> '}<strong>{edge.child_id}</strong>
          </div>
        ))}
      </div>

      <div>
        <h2>Current Node</h2>
        {currentNodeId !== null ? (
          <div><strong>Node ID:</strong> {currentNodeId}</div>
        ) : (
          <div>No node selected</div>
        )}
      </div>

      <div style={{ marginTop: '20px' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          style={inputStyle}
          placeholder="Type your message..."
        />
        <button onClick={sendMessage} style={buttonStyle}>
          Send
        </button>
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  marginRight: '10px',
  marginTop: '10px',
  cursor: 'pointer',
};

const smallButtonStyle: React.CSSProperties = {
  padding: '4px 8px',
  marginLeft: '10px',
  cursor: 'pointer',
};

const nodeStyle: React.CSSProperties = {
  marginBottom: '10px',
  border: '1px solid #ccc',
  padding: '10px',
  borderRadius: '4px',
};

const edgeStyle: React.CSSProperties = {
  marginBottom: '5px',
};

const inputStyle: React.CSSProperties = {
  padding: '8px',
  width: '300px',
  marginRight: '10px',
};