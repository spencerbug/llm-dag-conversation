// src/app/page.tsx
'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<number | null>(null);
  const [input, setInput] = useState('');

  useEffect(() => {
    fetch('/api/nodes')
      .then(res => res.json())
      .then(data => {
        setNodes(data.nodes);
        setEdges(data.edges);
      });
  }, []);

  const sendMessage = async () => {
    // Send the user's message to /api/messages
    const userResponse = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'user',
        content: input,
        parent_id: currentNodeId,
      }),
    });
    const userData = await userResponse.json();
    const userNodeId = userData.id;

    // Call the LLM API to get the assistant's response
    const llmResponse = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeId: userNodeId, // Pass the user's node ID
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error('LLM API Error:', llmResponse.status, errorText);
      return;
    }

    const llmData = await llmResponse.json();

    if (llmData.error) {
      console.error(llmData.error);
      return;
    }

    // Save the assistant's message
    const assistantResponse = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'assistant',
        content: llmData.content,
        parent_id: userNodeId,
      }),
    });
    const assistantData = await assistantResponse.json();

    // Update the nodes and edges
    fetch('/api/nodes')
      .then(res => res.json())
      .then(data => {
        setNodes(data.nodes);
        setEdges(data.edges);
      });

    // Set the current node to the assistant's node
    setCurrentNodeId(assistantData.id);
    setInput('');
  };

  const deleteNode = async (nodeId: number | null) => {
    const url = nodeId !== null ? `/api/nodes?id=${nodeId}` : '/api/nodes';
    const response = await fetch(url, {
      method: 'DELETE',
    });
    const data = await response.json();
    console.log(data.message);

    // Refresh the nodes and edges
    fetch('/api/nodes')
      .then(res => res.json())
      .then(data => {
        setNodes(data.nodes);
        setEdges(data.edges);
      });

    // If the current node was deleted, reset it
    if (nodeId === currentNodeId) {
      setCurrentNodeId(null);
    }
  };

  const handleContinueFromNode = (nodeId: number) => {
    setCurrentNodeId(nodeId);
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      sendMessage();
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>DAG LLM Experiment</h1>
      <div>
        <h2>Nodes</h2>
        <div>
          <button onClick={() => setCurrentNodeId(null)}>Clear current node</button>
          <button onClick={() => deleteNode(null)}>Delete all nodes</button>
        </div>
        {nodes.map(node => (
          <div key={node.id}>
            <strong>
              {node.role.toUpperCase()} ({node.id}):
            </strong>{' '}
            {node.content}
            <button onClick={() => handleContinueFromNode(node.id)}>
              Continue from here
            </button>
            <button onClick={() => deleteNode(node.id)}>Delete</button>
          </div>
        ))}
      </div>
      <div>
        <h2>Edges</h2>
        {/* Render root nodes (nodes without parents) */}
        {nodes
          .filter(node => !edges.some(edge => edge.child_id === node.id))
          .map(node => (
            <div key={`root-${node.id}`}>
              {'-> '}<strong>{node.id}</strong>
            </div>
          ))}
        {/* Render existing edges */}
        {edges.map(edge => (
          <div key={`${edge.parent_id}-${edge.child_id}`}>
            <strong>{edge.parent_id}</strong> {'-> '}<strong>{edge.child_id}</strong>
          </div>
        ))}
      </div>
      <div>
        <h2>Current Node</h2>
        {currentNodeId !== null ? (
          <div>
            <strong>Node ID:</strong> {currentNodeId}
          </div>
        ) : (
          <div>No node selected</div>
        )}
      </div>
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyPress={handleKeyPress}
        style={{ marginTop: '20px', marginRight: '10px' }}
      />
      <button onClick={sendMessage}>Send</button>
    </div>
  );
}