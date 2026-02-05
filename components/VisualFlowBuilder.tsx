
import React, { useState, useCallback } from 'react';
import ReactFlow, { 
  addEdge, 
  Background, 
  Controls, 
  Connection, 
  Edge, 
  Node, 
  useNodesState, 
  useEdgesState,
  Handle,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Settings, Phone, MessageSquare, Mic, User } from 'lucide-react';

// Custom Node Types
const StartNode = ({ data }: any) => (
  <div className="bg-green-500 text-white p-4 rounded-xl shadow-xl border-2 border-green-600 w-40 text-center">
    <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-white" />
    <div className="font-black uppercase tracking-widest text-[10px]">Inbound Call</div>
    <div className="text-xs font-bold mt-1">{data.label}</div>
  </div>
);

const MenuNode = ({ data }: any) => (
  <div className="bg-white p-4 rounded-xl shadow-xl border-2 border-slate-200 w-64">
    <Handle type="target" position={Position.Top} className="w-3 h-3 bg-slate-400" />
    <div className="flex items-center gap-3 mb-2">
      <div className="p-2 bg-brand-50 rounded-lg text-brand-600"><Settings size={16}/></div>
      <div className="font-black uppercase tracking-widest text-[10px] text-slate-500">IVR Menu</div>
    </div>
    <div className="text-xs font-medium text-slate-700 italic">"{data.prompt}"</div>
    <div className="mt-4 space-y-2">
       {data.options.map((opt: any, i: number) => (
         <div key={i} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100 relative">
            <span className="font-black text-xs w-6 h-6 flex items-center justify-center bg-slate-200 rounded-full">{opt.key}</span>
            <span className="text-[10px] font-bold uppercase text-slate-500">{opt.label}</span>
            <Handle type="source" position={Position.Right} id={`opt-${opt.key}`} className="w-2 h-2 bg-brand-500" style={{top: '50%'}} />
         </div>
       ))}
    </div>
  </div>
);

const QueueNode = ({ data }: any) => (
  <div className="bg-blue-50 p-4 rounded-xl shadow-xl border-2 border-blue-200 w-48 text-center">
    <Handle type="target" position={Position.Left} className="w-3 h-3 bg-blue-400" />
    <User size={24} className="mx-auto text-blue-500 mb-2"/>
    <div className="font-black uppercase tracking-widest text-[10px] text-blue-400">Route to Queue</div>
    <div className="text-sm font-black text-blue-800">{data.queueName}</div>
  </div>
);

const nodeTypes = {
  start: StartNode,
  menu: MenuNode,
  queue: QueueNode
};

const initialNodes: Node[] = [
  { id: '1', type: 'start', position: { x: 250, y: 0 }, data: { label: '+1 (555) 000-0000' } },
  { id: '2', type: 'menu', position: { x: 200, y: 150 }, data: { prompt: 'Press 1 for Sales, 2 for Support', options: [{key:'1', label:'Sales'}, {key:'2', label:'Support'}] } },
  { id: '3', type: 'queue', position: { x: 500, y: 300 }, data: { queueName: 'Sales Team' } },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', sourceHandle: 'opt-1', target: '3' }
];

export const VisualFlowBuilder = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  return (
    <div className="h-[600px] w-full bg-slate-50 rounded-[2rem] border border-slate-200 overflow-hidden shadow-inner">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background color="#cbd5e1" gap={20} size={1} />
        <Controls className="bg-white border border-slate-200 shadow-xl rounded-xl p-1" />
      </ReactFlow>
    </div>
  );
};
