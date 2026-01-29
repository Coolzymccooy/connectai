
import React from 'react';
import { Phone, ArrowRight, MessageSquare, Users, Bot, Sparkles } from 'lucide-react';
import { IvrConfig } from '../types';

interface VisualIvrProps {
  config: IvrConfig;
}

export const VisualIvr: React.FC<VisualIvrProps> = ({ config }) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
      <div className="flex flex-col items-center">
         <div className="flex flex-col items-center mb-8">
            <div className="bg-brand-900 text-white p-4 rounded-2xl shadow-lg border-4 border-brand-500 mb-2 flex items-center gap-3">
               <div className="bg-brand-500 p-2 rounded-lg"><Phone size={20}/></div>
               <div>
                  <p className="text-xs font-bold text-brand-300">Inbound Call</p>
                  <p className="font-mono font-bold">{config.phoneNumber}</p>
               </div>
            </div>
            <div className="w-0.5 h-8 bg-slate-200"></div>
         </div>

         <div className="flex flex-col items-center mb-12 relative w-full">
            <div className="bg-slate-50 border-2 border-slate-200 px-6 py-4 rounded-2xl text-center max-w-sm relative z-10 shadow-sm">
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Greeting Prompt</p>
               <p className="text-sm font-medium text-slate-700 italic">"{config.welcomeMessage}"</p>
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-[80%] h-8 border-x-2 border-t-2 border-slate-200 mt-2"></div>
         </div>

         <div className="flex justify-center gap-8 w-full flex-wrap">
            {config.options.map(option => (
               <div key={option.key} className="flex flex-col items-center">
                  <div className="w-0.5 h-8 bg-slate-200"></div>
                  <div className={`bg-white border-2 p-4 rounded-xl shadow-sm transition-all group w-44 text-center ${
                    option.action === 'BOT' ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-100'
                  }`}>
                     <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold mx-auto mb-2 ${
                       option.action === 'BOT' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
                     }`}>
                        {option.key}
                     </div>
                     <p className="text-xs font-bold text-slate-800 mb-1">{option.label}</p>
                     <p className={`text-[10px] uppercase flex items-center justify-center gap-1 font-bold ${
                       option.action === 'BOT' ? 'text-indigo-600' : 'text-slate-500'
                     }`}>
                        {option.action === 'QUEUE' ? <Users size={10}/> : 
                         option.action === 'VOICEMAIL' ? <MessageSquare size={10}/> : 
                         option.action === 'BOT' ? <Sparkles size={10}/> : <ArrowRight size={10}/>}
                        {option.target}
                     </p>
                  </div>
               </div>
            ))}
         </div>
      </div>
    </div>
  );
};
