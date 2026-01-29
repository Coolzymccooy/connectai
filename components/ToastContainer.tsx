
import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { Notification } from '../types';

interface ToastContainerProps {
  notifications: Notification[];
  removeNotification: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ notifications, removeNotification }) => {
  // Local state to track which notifications are "visible" as toasts
  const [visibleIds, setVisibleIds] = useState<string[]>([]);

  useEffect(() => {
    // When new notifications arrive, add them to visible list
    const latest = notifications.slice(0, 3);
    const latestIds = latest.map(n => n.id);
    
    latestIds.forEach(id => {
      if (!visibleIds.includes(id)) {
        setVisibleIds(prev => [...prev, id]);
        // Auto-dismiss after 4 seconds
        setTimeout(() => {
          setVisibleIds(prev => prev.filter(vId => vId !== id));
        }, 4000);
      }
    });
  }, [notifications]);

  const visibleNotes = notifications.filter(n => visibleIds.includes(n.id));

  if (visibleNotes.length === 0) return null;

  return (
    <div className="fixed top-20 right-6 z-[100] flex flex-col space-y-3 pointer-events-none">
      {visibleNotes.map((note) => (
        <div 
          key={note.id}
          className={`pointer-events-auto min-w-[320px] max-w-sm w-full bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl border-l-4 p-5 flex items-start space-x-4 animate-in slide-in-from-right-full fade-in duration-500 ${
            note.type === 'success' ? 'border-green-500' :
            note.type === 'error' ? 'border-red-500' : 'border-brand-500'
          }`}
        >
          <div className="shrink-0 pt-0.5">
            {note.type === 'success' && <CheckCircle size={20} className="text-green-500" />}
            {note.type === 'error' && <AlertCircle size={20} className="text-red-500" />}
            {note.type === 'info' && <Info size={20} className="text-brand-500" />}
          </div>
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">{note.type} protocol</p>
            <p className="text-sm font-bold text-slate-800 leading-tight">{note.message}</p>
          </div>
          <button 
            onClick={() => setVisibleIds(prev => prev.filter(id => id !== note.id))}
            className="text-slate-300 hover:text-slate-600 shrink-0 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      ))}
    </div>
  );
};
