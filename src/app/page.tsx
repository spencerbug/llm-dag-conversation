// src/app/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import NodeContent from '@/components/NodeContent';

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
  const [isLoading, setIsLoading] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('localNodes');
    if (stored) setNodes(JSON.parse(stored));
    if (session) fetchNodesAndEdges();
  }, [session]);

  useEffect(() => {
    localStorage.setItem('localNodes', JSON.stringify(nodes));
  }, [nodes]);

  const fetchNodesAndEdges = async () => {
    const res = await fetch('/api/nodes');
    const data = await res.json();
    setNodes(data.nodes);
    setEdges(data.edges);
  };

  const buildSummaryChain = (parentId: number | null) => {
    const chain: string[] = [];
    let current = nodes.find(n => n.id === parentId);
    while (current) {
      chain.push(current.summary);
      current = nodes.find(n => n.id === current?.parent_id);
    }
    return chain.reverse().join('\n');
  };

  const createNode = async (role: string, content: string, parentId: number | null) => {
    // Summarize
    let summary = '';
    try {
      const summaries = buildSummaryChain(parentId);
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `All previous summaries:\n${summaries}\n\nNew content:\n${content}`,
        }),
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        summary = data.summary;
      }
    } catch (err) {
      console.error('Summarize error:', err);
    }

    // Insert
    const resp = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content, parent_id: parentId }),
    });
    const result = await resp.json();
    const newId = result.id;
    const newNode: NodeData = { id: newId, parent_id: parentId, role, content, summary };
    setNodes(prev => [...prev, newNode]);
    if (parentId) setEdges(prev => [...prev, { parent_id: parentId, child_id: newId }]);
    return newId;
  };

  // ---------------------
  // Send or stop requests
  // ---------------------
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    setIsLoading(true);
    const controller = new AbortController();
    setAbortController(controller);

    try {
      // 1) user node
      const userNodeId = await createNode('user', input, currentNodeId);

      // 2) call LLM
      const llmResponse = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: userNodeId }),
        signal: controller.signal,
      });
      if (!llmResponse.ok) throw new Error(`/api/llm error ${llmResponse.status}`);
      const llmData = await llmResponse.json();
      if (llmData.error) throw new Error(llmData.error);

      // 3) assistant node
      const assistantNodeId = await createNode('assistant', llmData.content, userNodeId);
      setCurrentNodeId(assistantNodeId);
      setInput('');
    } catch (err) {
      console.error('LLM request aborted or failed:', err);
    }

    setIsLoading(false);
    setAbortController(null);
  };

  const stopFetch = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsLoading(false);
    }
  };

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
    await fetch(nodeId !== null ? `/api/nodes?id=${nodeId}` : '/api/nodes', { method: 'DELETE' });
    await fetchNodesAndEdges();
    if (nodeId === currentNodeId) setCurrentNodeId(null);
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
        <button onClick={() => setCurrentNodeId(null)}>
          Clear current node
        </button>
        {nodes.map(node => (
          <div key={node.id} style={{ margin: '5px 0', border: '1px solid #ccc', padding: '5px' }}>
            <strong>{node.role.toUpperCase()} (ID {node.id}):</strong>
            <NodeContent content={node.content} />
            {node.summary && <em>Summary: {node.summary}</em>}
            <div>
              <button onClick={() => handleContinueFromNode(node.id)}>Continue</button>
              <button onClick={() => deleteNode(node.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2>Edges</h2>
        {/* Root nodes */}
        {nodes
          .filter(n => !edges.some(e => e.child_id === n.id))
          .map(n => (
            <div key={`root-${n.id}`}>{'-> '}<strong>{n.id}</strong></div>
          ))}
        {/* Render edges */}
        {edges.map(e => (
          <div key={`${e.parent_id}-${e.child_id}`}>
            {e.parent_id} -> {e.child_id}
          </div>
        ))}
      </div>

      <div>
        <h2>Current Node</h2>
        {currentNodeId ?? 'None'}
      </div>

      {/* INPUT + BUTTONS */}
      <div style={{ marginTop: '20px' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          style={{ width: '300px', marginRight: '5px' }}
        />
        {!isLoading && (
          <button onClick={sendMessage}>Send</button>
        )}
        {isLoading && (
          <>
            <button onClick={stopFetch}>Stop</button>
            <span style={{ marginLeft: '10px' }}>Loading...</span>
          </>
        )}
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