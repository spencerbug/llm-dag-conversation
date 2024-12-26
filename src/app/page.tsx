// src/app/page.tsx
'use client';
import React, { useState, useEffect, useRef, MouseEvent } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Network } from 'vis-network/standalone';
import NodeContent from '@/components/NodeContent';  // Markdown display
import './globals.css'; // Ensure you have the necessary styles

type NodeData = {
  id: number | string;
  role: string;   // "user" or "assistant"
  content: string;
  summary: string;
};

export default function Page() {
  const { data: session, status } = useSession();
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [edges, setEdges] = useState<{ parent_id: number | string; child_id: number | string }[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [inputText, setInputText] = useState('');
  const [currentModel, setCurrentModel] = useState('gpt-3.5-turbo');
  const [isLoading, setIsLoading] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const visContainerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);

  // Resizer related states
  const [isResizing, setIsResizing] = useState(false);
  const [topPaneHeight, setTopPaneHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session) fetchNodesAndEdges();
  }, [session]);

  const fetchNodesAndEdges = async () => {
    try {
      const resp = await fetch('/api/nodes');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setNodes(data.nodes);
      setEdges(data.edges);
    } catch (err) {
      console.error('Error fetching nodes/edges:', err);
    }
  };

  const nodeMap = React.useMemo(() => {
    const map = new Map<number, NodeData>();
    for (const n of nodes) {
      const nId = typeof n.id === 'string' ? parseInt(n.id, 10) : n.id;
      map.set(nId, n);
    }
    return map;
  }, [nodes]);

  const parentMap = React.useMemo(() => {
    const map = new Map<number, number | null>();
    edges.forEach(e => {
      const parentId = typeof e.parent_id === 'string' ? parseInt(e.parent_id, 10) : e.parent_id;
      const childId = typeof e.child_id === 'string' ? parseInt(e.child_id, 10) : e.child_id;
      map.set(childId, parentId);
    });
    return map;
  }, [edges]);

  const getNodeChain = (nodeId: number | null): NodeData[] => {
    if (!nodeId) return [];
    const chain: NodeData[] = [];
    let current = nodeMap.get(nodeId);
    while (current) {
      chain.push(current);
      const p = parentMap.get(
        typeof current.id === 'string'
          ? parseInt(current.id, 10)
          : current.id
      );
      if (!p) break;
      current = nodeMap.get(p);
    }
    return chain.reverse(); 
  };

  const conversationChain = currentNodeId ? getNodeChain(currentNodeId) : [];

  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [conversationChain]);

  useEffect(() => {
    if (!visContainerRef.current) return;

    const visNodes = nodes.map(n => {
      const nodeId = typeof n.id === 'string' ? parseInt(n.id, 10) : n.id;
      return {
        id: nodeId,
        label: n.summary ? n.summary : n.content.slice(0, 20) + '…',
        color: n.role === 'user' ? '#fff' : '#7FDBFF',
        font: { color: n.role === 'user' ? '#001f3f' : '#000' },
      };
    });
    const visEdges = edges.map(e => ({
      from: typeof e.parent_id === 'string' ? parseInt(e.parent_id, 10) : e.parent_id,
      to: typeof e.child_id === 'string' ? parseInt(e.child_id, 10) : e.child_id,
    }));

    if (networkRef.current) {
      networkRef.current.destroy();
    }

    networkRef.current = new Network(
      visContainerRef.current,
      { nodes: visNodes, edges: visEdges },
      {
        autoResize: false, // Changed from true to false
        height: '100%',    // Explicitly set height
        width: '100%',     // Explicitly set width
        layout: {
          hierarchical: {
            enabled: true,
            direction: 'UD',
            sortMethod: 'directed',
            levelSeparation: 80,
            blockShifting: false,
            edgeMinimization: false,
            parentCentralization: false
          },
        },
        physics: {
          enabled: true,
          hierarchicalRepulsion: {
            nodeDistance: 50,
            avoidOverlap: 1,
          },
        },
        interaction: {
          dragNodes: true
        },
      }
    );

    // Left-click → set for branching (not editing)
    networkRef.current.on('click', params => {
      if (params?.nodes?.length > 0) {
        setCurrentNodeId(params.nodes[0]);
        setInputText(''); 
        setIsEditing(false); // reset editing
      } else {
        // clicking background clears current node
        setCurrentNodeId(null);
        setInputText('');
        setIsEditing(false); // reset editing
      }
    });

    // Right-click → specifically edit
    networkRef.current.on('oncontext', params => {
      params.event.preventDefault();
      if (params?.nodes?.length > 0) {
        const nodeId: number = params.nodes[0];
        const ans = window.prompt(`Type "edit" or "delete" for node ${nodeId}`);
        if (!ans) return;
        if (ans.toLowerCase().startsWith('delete')) handleNodeDelete(nodeId);
        if (ans.toLowerCase().startsWith('edit')) handleNodeEdit(nodeId);
      }
    });
  }, [nodes, edges, nodeMap]);

  const handleNodeEdit = (nodeId: number) => {
    const nodeToEdit = nodeMap.get(nodeId);
    if (!nodeToEdit) return;
    if (!window.confirm('Editing removes children. Proceed?')) return;
    setInputText(nodeToEdit.content);
    setCurrentNodeId(nodeId);
    setIsEditing(true);
  };

  const submitEditedNode = async (nodeId: number, newContent: string) => {
    setIsLoading(true);
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    try {
      await fetch(`/api/nodes?id=${nodeId}`, { method: 'DELETE' });

      const putResp = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: nodeId,
          role: 'user',
          content: newContent,
          parent_id: null,
        }),
      });
      if (!putResp.ok) throw new Error(`putResp: HTTP ${putResp.status}`);

      await fetchNodesAndEdges();
      setInputText('');
      setCurrentNodeId(nodeId);
    } catch (err) {
      console.error('Error editing node:', err);
    }
    setIsLoading(false);
  };

  const handleNodeDelete = async (nodeId: number) => {
    try {
      const resp = await fetch(`/api/nodes?id=${nodeId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await fetchNodesAndEdges();
      if (nodeId === currentNodeId) setCurrentNodeId(null);
      setIsEditing(false);
      setInputText('');
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const stopFetch = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsLoading(false);
    }
  };

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // Only edit if isEditing is true, otherwise create a new branch from current
  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    if (isEditing && currentNodeId) {
      await submitEditedNode(Number(currentNodeId), inputText);
      setIsEditing(false);
      return;
    }

    setIsLoading(true);
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const userRes = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          role: 'user',
          content: inputText,
          parent_id: currentNodeId,
        }),
      });
      const userData = await userRes.json();
      if (!userRes.ok) throw new Error(JSON.stringify(userData));

      const llmRes = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          nodeId: userData.id,
          model: currentModel,
        }),
      });
      const llmData = await llmRes.json();
      if (!llmRes.ok) throw new Error(JSON.stringify(llmData));

      const assistantRes = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          role: 'assistant',
          content: llmData.content,
          parent_id: userData.id,
        }),
      });
      const assistantData = await assistantRes.json();
      if (!assistantRes.ok) throw new Error(JSON.stringify(assistantData));

      setCurrentNodeId(assistantData.id);
      setInputText('');
      await fetchNodesAndEdges();
    } catch (err) {
      console.error('LLM request failed or aborted:', err);
    }
    setIsEditing(false);
    setIsLoading(false);
    setAbortController(null);
  };

  const maxTextBoxHeightPx = 200;

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    // reset first so new content shrinks/grows properly
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, maxTextBoxHeightPx)}px`;
  };

  // Resizer Handlers
  const startResizing = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const stopResizing = () => {
    setIsResizing(false);
  };

  const resize = (e: MouseEvent<Document>) => {
    if (!isResizing || !containerRef.current) return;
    const containerTop = containerRef.current.getBoundingClientRect().top;
    const newHeight = e.clientY - containerTop;
    const minHeight = 100; // Minimum height for top pane
    const maxHeight = containerRef.current.clientHeight - minHeight;
    if (newHeight >= minHeight && newHeight <= maxHeight) {
      setTopPaneHeight(newHeight);
    }
  };

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', resize as any);
      document.addEventListener('mouseup', stopResizing);
    } else {
      document.removeEventListener('mousemove', resize as any);
      document.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      document.removeEventListener('mousemove', resize as any);
      document.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing]);

  if (status === 'loading') return <div>Loading session…</div>;
  if (!session) {
    return (
      <div style={{ padding: '1rem' }}>
        <h1>Please sign in</h1>
        <Link href="/login"><button>Login</button></Link>{' '}
        <Link href="/register"><button>Register</button></Link>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top Pane: Graph Navigator */}
      <div
        style={{
          height: topPaneHeight || '40%', // Default 40% height
          minHeight: 100,
          flexShrink: 0, // Prevent shrinking
          position: 'relative',
          overflow: 'hidden', // Changed from 'auto' to 'hidden'
          borderBottom: '2px solid #ccc',
        }}
      >
        <div
          ref={visContainerRef}
          style={{
            width: '100%',
            height: '100%',
            border: '1px solid #ccc',
            marginTop: '0.5rem',
            overflow: 'hidden',
          }}
        />
      </div>

      {/* Resizer */}
      <div
        onMouseDown={startResizing}
        className="resizer"
        style={{
          height: '6px',
          background: '#888',
          cursor: 'row-resize',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Optional: Add a visual indicator */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '80%',
            height: '2px',
            backgroundColor: '#fff',
            borderRadius: '1px',
          }}
        />
      </div>

      {/* Bottom Pane: Conversation and Input */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0.5rem', overflow: 'hidden' }}>
        {/* Conversation */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            paddingBottom: '1rem', // Space for the input area
          }}
          ref={conversationRef}
        >
          {conversationChain.length === 0 && <p>No conversation selected.</p>}
          {conversationChain.map(node => (
            <div
              key={node.id}
              style={{
                backgroundColor: node.role === 'user' ? '#fff' : '#7FDBFF',
                color: node.role === 'user' ? '#001f3f' : '#000',
                margin: '0.5rem 0',
                padding: '0.5rem',
                borderRadius: '4px',
              }}
            >
              <strong>{node.role.toUpperCase()} (ID {node.id}):</strong>
              <NodeContent content={node.content} />
            </div>
          ))}
        </div>

        {/* Fixed bottom input area */}
        <div style={{ flex: '0 0 auto', borderTop: '1px solid #ccc', padding: '0.5rem', backgroundColor: '#fff' }}>
          <div
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '8px',
              backgroundColor: '#fff',
            }}
          >
            <textarea
              rows={3}
              value={inputText}
              onChange={handleInputChange}
              onFocus={e => (e.currentTarget.parentElement!.style.border = '1px solid #007bff')}
              onBlur={e => (e.currentTarget.parentElement!.style.border = '1px solid #ccc')}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                height: 'auto',
                maxHeight: `${maxTextBoxHeightPx}px`,
                overflowY: 'auto',
                marginBottom: '0.5rem',
                fontSize: '1rem',
                borderRadius: '4px',
                border: 'none',
                padding: '0.5rem',
                backgroundColor: '#f0f0f0',
                outline: 'none',
                resize: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '3rem' }}>
              {/* Attach File Button */}
              <button style={{ border: 'none', fontSize: '1.5rem', background: 'none' }}>📎</button>

              {/* Model Selector and Send Button */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <select
                  value={currentModel}
                  onChange={e => setCurrentModel(e.target.value)}
                  style={{
                    marginRight: '1rem',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    backgroundColor: '#fff',
                    fontSize: '1rem',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    backgroundImage: 'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEuNzA3MTQsNC4yOTI5N0w4LjAwMDAxLDEwLjU4NTZMMTMuMjkyOSw0LjI5MjlDMTMuNjk1NCwzLjg5MjM1IDE0LjMwNDcsMy44OTIzNSAxNC43MDcxLDQuMjkyOTdDMTUuMTA5NSw0LjY5MzYgMTUuMTA5NSw1LjMwNDY0IDE0LjcwNzEsNS43MDcxM0w4LjcwNzA5LDEyLjcwNzFDOC4zMDQ2NCwxMy4xMDk1IDcuNjk1MzYsMTMuMTA5NSA3LjI5MjkzLDEyLjcwNzFMMS4yOTI5Nyw1LjcwNzEzQzAuODkyMzQ0LDUuMzA0NjQgMC44OTIzNDQsNC42OTM2IDEuMjkyOTcsNC4yOTI5N1oiIGZpbGw9IiMwMDAiLz4KPC9zdmc+Cg==)',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.5rem center',
                    width: '10rem',
                    cursor: 'pointer'
                  }}
                >
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                </select>
                {isLoading ? (
                  <>
                    <button onClick={stopFetch} style={{ marginRight: '0.5rem', padding: '0.5rem 1rem' }}>Stop</button>
                    <span>Loading…</span>
                  </>
                ) : (
                  <button onClick={sendMessage} style={{ border: 'none', fontSize: '1.5rem', background: 'none' }}>
                    {isEditing ? '✅' : '➡️'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}