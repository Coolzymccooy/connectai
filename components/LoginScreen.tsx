import React, { useEffect, useState, useRef } from 'react';
import { User, Shield, Lock, Headset, LayoutDashboard, Settings, Mail, KeyRound, ArrowRight, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Role } from '../types';
import { auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, updateProfile, GoogleAuthProvider, signInWithPopup } from '../services/firebase';
import { acceptInvite, fetchAuthPolicy } from '../services/authPolicyService';

interface LoginScreenProps {
  onLogin: (role: Role, profile?: { uid: string; email?: string | null; displayName?: string | null }) => void;
  externalMessage?: string | null;
  onClearExternalMessage?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, externalMessage, onClearExternalMessage }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>(Role.AGENT);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [policyCache, setPolicyCache] = useState<any>(null);

  // Prefetch policy on email blur for faster login
  const handleEmailBlur = async () => {
    if (email && email.includes('@')) {
      try {
        const policy = await fetchAuthPolicy(email);
        setPolicyCache(policy);
      } catch (e) {
        // Ignore errors during prefetch
      }
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem('connectai_pending_verification_email');
    if (stored) {
      setPendingVerificationEmail(stored);
      if (!email) setEmail(stored);
    }
  }, []);

  const friendlyError = (err: any) => {
    const code = err?.code || '';
    switch (code) {
      case 'auth/operation-not-allowed':
        return 'This sign-in method is not enabled yet. Enable Email/Password or Google in Firebase Auth.';
      case 'auth/invalid-email':
        return 'That email address looks invalid. Please check and try again.';
      case 'auth/user-not-found':
        return 'No account found for this email. Create an account first.';
      case 'auth/wrong-password':
        return 'Incorrect password. Please try again.';
      case 'auth/email-already-in-use':
        return 'This email is already registered. Please sign in instead.';
      case 'auth/weak-password':
        return 'Password is too weak. Use at least 6 characters.';
      case 'auth/popup-closed-by-user':
        return 'Google sign-in was closed. Please try again.';
      case 'auth/popup-blocked':
        return 'Popup blocked by browser. Allow popups and try again.';
      case 'auth/unauthorized-domain':
        return 'This domain is not authorized in Firebase. Add it in Firebase Auth settings.';
      default:
        return err?.message || 'Authentication failed.';
    }
  };

  const extractDomain = (value: string) => {
    const at = value.lastIndexOf('@');
    if (at === -1) return '';
    return value.slice(at + 1).toLowerCase();
  };

  const enforcePolicy = async (value: string) => {
    // Use cached policy if available and matches email
    let policy = policyCache;
    if (!policy) {
        policy = await fetchAuthPolicy(value);
    }

    const domain = extractDomain(value);
    if (policy.allowedDomains?.length) {
      const allowed = policy.allowedDomains.map((d: string) => d.toLowerCase());
      if (!domain || !allowed.includes(domain)) {
        return { error: 'This email domain is not allowed for this organization.' };
      }
    }
    if (policy.inviteOnly) {
      if (!policy.invite || policy.invite.status !== 'pending') {
        return { error: 'Invite required. Please ask an admin to invite you.' };
      }
    }
    if (policy.tenantId) {
      localStorage.setItem('connectai_tenant_id', policy.tenantId);
    }
    return { policy };
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // 1. Start Auth immediately (don't wait for policy if possible, but we need policy for invite-only)
      // We'll run policy check in parallel if not cached, but logic requires it first for blocking.
      // However, prefetch makes this fast.
      const policyCheck = await enforcePolicy(email);
      if (policyCheck.error) {
        setError(policyCheck.error);
        setBusy(false);
        return;
      }

      const result = await signInWithEmailAndPassword(auth, email, password);
      const user = result.user;
      
      // Let App.tsx handle the verification state instead of signing out here
      // This allows the "Smart Response" (polling for verification)
      
      const resolvedRole = policyCheck.policy?.invite?.role || role;
      onLogin(resolvedRole, { uid: user.uid, email: user.email, displayName: user.displayName });
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const policyCheck = await enforcePolicy(email);
      if (policyCheck.error) {
        setError(policyCheck.error);
        return;
      }
      const result = await createUserWithEmailAndPassword(auth, email, password);
      if (name) {
        await updateProfile(result.user, { displayName: name });
      }
      if (policyCheck.policy?.invite?.id) {
        await acceptInvite(policyCheck.policy.invite.id);
      }
      await sendEmailVerification(result.user);
      setMessage('Account created. Check your email to verify before signing in.');
      setPendingVerificationEmail(email);
      localStorage.setItem('connectai_pending_verification_email', email);
      // We stay logged in, App.tsx will show verification screen
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('Password reset email sent.');
      setTimeout(() => setMode('login'), 2000);
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const policyCheck = await enforcePolicy(user.email || '');
      if (policyCheck.error) {
        setError(policyCheck.error);
        await signOut(auth);
        return;
      }
      if (policyCheck.policy?.invite?.id) {
        await acceptInvite(policyCheck.policy.invite.id);
      }
      const resolvedRole = policyCheck.policy?.invite?.role || role;
      onLogin(resolvedRole, { uid: user.uid, email: user.email, displayName: user.displayName });
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setMessage('Verification email re-sent.');
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 sm:p-6 transition-all duration-500">
      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 bg-white rounded-[2rem] shadow-2xl overflow-hidden min-h-[600px] border border-slate-100">
        {/* Left: Brand Side */}
        <div className="bg-brand-950 p-12 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
             <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle,rgba(99,102,241,0.4)_0%,transparent_60%)] animate-pulse-slow"></div>
          </div>

          <div className="z-10">
            <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-brand-900/50 mb-8 border border-white/10">
              C
            </div>
            <h1 className="text-4xl font-black italic tracking-tighter mb-4 text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">ConnectAI</h1>
            <p className="text-brand-200 font-medium text-lg max-w-sm leading-relaxed">The AI-native contact center for the modern enterprise.</p>
          </div>

          <div className="space-y-6 z-10">
            <div className="flex items-center space-x-4 text-sm text-brand-100 group">
              <div className="p-3 bg-white/5 rounded-2xl group-hover:bg-brand-500/20 transition-colors"><Headset size={20} /></div>
              <span className="font-bold tracking-wide">Neural Softphone</span>
            </div>
            <div className="flex items-center space-x-4 text-sm text-brand-100 group">
              <div className="p-3 bg-white/5 rounded-2xl group-hover:bg-brand-500/20 transition-colors"><LayoutDashboard size={20} /></div>
              <span className="font-bold tracking-wide">Real-time Analytics</span>
            </div>
            <div className="flex items-center space-x-4 text-sm text-brand-100 group">
              <div className="p-3 bg-white/5 rounded-2xl group-hover:bg-brand-500/20 transition-colors"><Shield size={20} /></div>
              <span className="font-bold tracking-wide">Enterprise Security</span>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-8 opacity-50">
             <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
             <p className="text-[10px] font-black uppercase tracking-[0.2em]">System Operational</p>
          </div>
        </div>

        {/* Right: Auth Form */}
        <div className="p-8 md:p-12 flex flex-col justify-center bg-white relative">
          
          <div className="flex items-center gap-2 mb-8 bg-slate-100/50 p-1.5 rounded-2xl w-fit self-center md:self-start">
            <button onClick={() => setMode('login')} className={`px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${mode === 'login' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>Sign In</button>
            <button onClick={() => setMode('signup')} className={`px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${mode === 'signup' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>Sign Up</button>
          </div>

          <div className="mb-8">
             <h2 className="text-3xl font-black text-slate-800 italic uppercase tracking-tighter mb-2">{mode === 'signup' ? 'Join the Cluster' : mode === 'reset' ? 'Reset Access' : 'Welcome Back'}</h2>
             <p className="text-slate-500 font-medium text-sm">{mode === 'reset' ? 'Enter your email to receive a recovery link.' : 'Sign in to access your workspace.'}</p>
          </div>

          <form onSubmit={mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handleReset} className="space-y-5">
            {mode === 'signup' && (
              <div className="group bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 focus-within:border-brand-500 focus-within:bg-white transition-all flex items-center gap-3">
                <User size={18} className="text-slate-400 group-focus-within:text-brand-500 transition-colors" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full Name"
                  className="w-full bg-transparent outline-none text-sm font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-medium"
                  required
                />
              </div>
            )}

            <div className="group bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 focus-within:border-brand-500 focus-within:bg-white transition-all flex items-center gap-3">
              <Mail size={18} className="text-slate-400 group-focus-within:text-brand-500 transition-colors" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={handleEmailBlur}
                placeholder="Email Address"
                type="email"
                className="w-full bg-transparent outline-none text-sm font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-medium"
                required
              />
            </div>

            {mode !== 'reset' && (
              <div className="group bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 focus-within:border-brand-500 focus-within:bg-white transition-all flex items-center gap-3">
                <KeyRound size={18} className="text-slate-400 group-focus-within:text-brand-500 transition-colors" />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  type="password"
                  className="w-full bg-transparent outline-none text-sm font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-medium"
                  required
                />
              </div>
            )}

            {mode === 'signup' && (
              <div className="group bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 focus-within:border-brand-500 focus-within:bg-white transition-all flex items-center gap-3">
                <Shield size={18} className="text-slate-400 group-focus-within:text-brand-500 transition-colors" />
                <select
                  className="w-full bg-transparent text-sm font-bold text-slate-600 outline-none cursor-pointer"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value={Role.AGENT}>Agent Role</option>
                  <option value={Role.SUPERVISOR}>Supervisor Role</option>
                  <option value={Role.ADMIN}>Admin Role</option>
                </select>
              </div>
            )}
            
            {mode === 'login' && (
               <div className="flex justify-end">
                  <button type="button" onClick={() => setMode('reset')} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-brand-600 transition-colors">Forgot Password?</button>
               </div>
            )}

            {error && (
               <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl text-xs font-bold flex items-start gap-3 animate-in slide-in-from-top-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5"/>
                  <span>{error}</span>
               </div>
            )}
            
            {message && (
               <div className="bg-green-50 border border-green-100 text-green-700 p-4 rounded-2xl text-xs font-bold flex items-start gap-3 animate-in slide-in-from-top-2">
                  <CheckCircle size={16} className="shrink-0 mt-0.5"/>
                  <span>{message}</span>
               </div>
            )}

            {externalMessage && (
              <div className="bg-amber-50 border border-amber-100 text-amber-700 p-4 rounded-2xl text-xs font-bold flex items-start justify-between gap-3 animate-in slide-in-from-top-2">
                <span>{externalMessage}</span>
                {onClearExternalMessage && (
                  <button type="button" className="text-[10px] font-black uppercase tracking-widest hover:text-amber-900 underline" onClick={onClearExternalMessage}>
                    Dismiss
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-slate-800 active:scale-[0.98] transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : mode === 'login' ? 'Initialize Session' : mode === 'signup' ? 'Create Account' : 'Send Link'}
              {!busy && <ArrowRight size={16}/>}
            </button>

            {mode === 'login' && (
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                <div className="relative flex justify-center"><span className="bg-white px-4 text-[10px] font-black uppercase text-slate-300 tracking-widest">Or Continue With</span></div>
              </div>
            )}

            {mode === 'login' && (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={busy}
                className="w-full py-4 bg-white border-2 border-slate-100 text-slate-600 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-center gap-3"
              >
                <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
                Google Workspace
              </button>
            )}
          </form>
          
          <div className="mt-8 flex items-center justify-center gap-2 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
            <Lock size={12} />
            <span>256-Bit SSL Encrypted</span>
          </div>
        </div>
      </div>
    </div>
  );
};

