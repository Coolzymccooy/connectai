import React from 'react';
import { User, Shield, Lock, ArrowRight, Headset, LayoutDashboard, Settings } from 'lucide-react';
import { Role } from '../types';

interface LoginScreenProps {
  onLogin: (role: Role) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 bg-white rounded-2xl shadow-xl overflow-hidden min-h-[500px]">
        
        {/* Left: Brand Side */}
        <div className="bg-brand-900 p-12 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
             <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle,rgba(255,255,255,0.8)_0%,transparent_60%)]"></div>
          </div>
          
          <div className="z-10">
            <div className="w-12 h-12 bg-brand-500 rounded-xl flex items-center justify-center text-white font-bold text-2xl shadow-lg mb-6">
              C
            </div>
            <h1 className="text-3xl font-bold mb-2">ConnectAI</h1>
            <p className="text-brand-200">The AI-native contact center for modern SMBs.</p>
          </div>

          <div className="space-y-4 z-10">
            <div className="flex items-center space-x-3 text-sm text-brand-100">
              <div className="p-2 bg-white/10 rounded-lg"><Headset size={16} /></div>
              <span>AI-powered Softphone</span>
            </div>
            <div className="flex items-center space-x-3 text-sm text-brand-100">
              <div className="p-2 bg-white/10 rounded-lg"><LayoutDashboard size={16} /></div>
              <span>Real-time Analytics</span>
            </div>
            <div className="flex items-center space-x-3 text-sm text-brand-100">
              <div className="p-2 bg-white/10 rounded-lg"><Shield size={16} /></div>
              <span>Enterprise Compliance</span>
            </div>
          </div>

          <p className="text-xs text-brand-300 mt-8">v1.0.4-MVP • Phase 3 Complete</p>
        </div>

        {/* Right: Login Form */}
        <div className="p-12 flex flex-col justify-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome Back</h2>
          <p className="text-slate-500 mb-8">Select a persona to sign in to the demo environment.</p>

          <div className="space-y-4">
            
            {/* Agent Persona */}
            <button 
              onClick={() => onLogin(Role.AGENT)}
              className="w-full group flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-brand-500 hover:shadow-md transition-all bg-white text-left"
            >
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Headset size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-700 group-hover:text-brand-600 transition-colors">Sarah Agent</h3>
                  <p className="text-xs text-slate-500">Sales & Support • Ext 101</p>
                </div>
              </div>
              <ArrowRight size={18} className="text-slate-300 group-hover:text-brand-500 transform group-hover:translate-x-1 transition-all" />
            </button>

            {/* Supervisor Persona */}
            <button 
              onClick={() => onLogin(Role.SUPERVISOR)}
              className="w-full group flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-brand-500 hover:shadow-md transition-all bg-white text-left"
            >
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <LayoutDashboard size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-700 group-hover:text-brand-600 transition-colors">Mike Supervisor</h3>
                  <p className="text-xs text-slate-500">Team Lead • Analytics View</p>
                </div>
              </div>
              <ArrowRight size={18} className="text-slate-300 group-hover:text-brand-500 transform group-hover:translate-x-1 transition-all" />
            </button>

            {/* Admin Persona */}
            <button 
              onClick={() => onLogin(Role.ADMIN)}
              className="w-full group flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-brand-500 hover:shadow-md transition-all bg-white text-left"
            >
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                  <Settings size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-700 group-hover:text-brand-600 transition-colors">Sys Admin</h3>
                  <p className="text-xs text-slate-500">Configuration & Billing</p>
                </div>
              </div>
              <ArrowRight size={18} className="text-slate-300 group-hover:text-brand-500 transform group-hover:translate-x-1 transition-all" />
            </button>

          </div>
          
          <div className="mt-8 flex items-center justify-center text-xs text-slate-400">
            <Lock size={12} className="mr-1" />
            <span>Secure 256-bit Encrypted Connection</span>
          </div>
        </div>

      </div>
    </div>
  );
};
