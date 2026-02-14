import React, { useEffect, useState, useRef } from 'react';
import { User, Shield, Lock, Headset, LayoutDashboard, Settings, Mail, KeyRound, ArrowRight, Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Role } from '../types';
import { auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, updateProfile, GoogleAuthProvider, signInWithPopup } from '../services/firebase';
import { acceptInvite, fetchAuthPolicy } from '../services/authPolicyService';
import { BrandLogo } from './BrandLogo';

interface LoginScreenProps {
  onLogin: (role: Role, profile?: { uid: string; email?: string | null; displayName?: string | null }) => void;
  externalMessage?: string | null;
  onClearExternalMessage?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, externalMessage, onClearExternalMessage }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
    const message = err?.message || '';
    const code = err?.code || '';
    
    // Generic "Invalid Credential" handling for security standard
    if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        return 'Invalid email or password. Please try again.';
    }

    switch (code) {
      case 'auth/operation-not-allowed':
        return 'Sign-in method disabled. Contact support.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/email-already-in-use':
        return 'Email already in use. Please sign in instead.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/popup-closed-by-user':
        return 'Sign-in cancelled.';
      case 'auth/popup-blocked':
        return 'Popup blocked. Please allow popups.';
      case 'auth/unauthorized-domain':
        return 'Domain not authorized.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection.';
      default:
        // Strip "Firebase: " prefix if present for cleaner UI
        return message.replace('Firebase: ', '').replace(/ \(.+\)/, '') || 'Authentication failed.';
    }
  };

  const extractDomain = (value: string) => {
    const at = value.lastIndexOf('@');
    if (at === -1) return '';
    return value.slice(at + 1).toLowerCase();
  };

  const enforcePolicy = async (value: string) => {
    // Optimistic return if no special chars to avoid blocking UI on simple login
    if (!value) return { policy: null };

    // Use cached policy if available
    let policy = policyCache;
    
    // Only fetch if strictly necessary (invite flows) or if we don't have it
    if (!policy) {
        try {
            policy = await fetchAuthPolicy(value);
        } catch (e) {
            console.warn("Policy fetch failed, proceeding with default auth", e);
            return { policy: null };
        }
    }

    const domain = extractDomain(value);
    if (policy?.allowedDomains?.length) {
      const allowed = policy.allowedDomains.map((d: string) => d.toLowerCase());
      if (!domain || !allowed.includes(domain)) {
        return { error: 'This email domain is not allowed.' };
      }
    }
    if (policy?.inviteOnly) {
      if (!policy.invite || policy.invite.status !== 'pending') {
        return { error: 'Invite required. Contact admin.' };
      }
    }
    if (policy?.tenantId) {
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
      // Parallel execution: Start Auth immediately. Policy check runs alongside.
      const authPromise = signInWithEmailAndPassword(auth, email, password);
      const policyPromise = enforcePolicy(email);

      const [result, policyCheck] = await Promise.all([authPromise, policyPromise]);

      if (policyCheck.error) {
        await signOut(auth); // Rollback
        setError(policyCheck.error);
        setBusy(false);
        return;
      }

      const user = result.user;
      
      // Resolve role: explicit selection overrides default if allowed, but invite role takes precedence
      const finalRole = policyCheck.policy?.invite?.role || role; 
      
      onLogin(finalRole, { uid: user.uid, email: user.email, displayName: user.displayName });
    } catch (err: any) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  const handleSignup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        setBusy(false);
        return;
      }
      const policyCheck = await enforcePolicy(email);
      if (policyCheck.error) {
        setError(policyCheck.error);
        setBusy(false);
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
      setMessage('Account created. Check your email to verify.');
      setPendingVerificationEmail(email);
      localStorage.setItem('connectai_pending_verification_email', email);
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
      setMessage('Reset link sent to your email.');
      setTimeout(() => setMode('login'), 3000);
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
        setBusy(false);
        return;
      }
      if (policyCheck.policy?.invite?.id) {
        await acceptInvite(policyCheck.policy.invite.id);
      }
      const finalRole = policyCheck.policy?.invite?.role || role;
      onLogin(finalRole, { uid: user.uid, email: user.email, displayName: user.displayName });
    } catch (err: any) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  const handlePendingInviteCta = async () => {
    if (!email || !email.includes('@')) {
      setMode('signup');
      return;
    }
    try {
      const policy = await fetchAuthPolicy(email);
      setPolicyCache(policy);
      if (policy?.invite?.status === 'pending' || !policy?.inviteOnly) {
        setMode('signup');
        setError(null);
      }
    } catch {
      setMode('signup');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(120%_120%_at_50%_0%,#111827_0%,#0f172a_55%,#020617_100%)] flex flex-col justify-center items-center p-4 sm:p-6 transition-all duration-500 overflow-y-auto">
      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden border border-white/20 min-h-0 md:min-h-[560px] my-auto">
        {/* Left: Brand Side - Hidden on Mobile to prioritize Login */}
          <div className="hidden md:flex bg-[linear-gradient(145deg,#0f172a_0%,#1e1b4b_60%,#312e81_100%)] p-12 text-white flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle,rgba(255,255,255,0.8)_0%,transparent_60%)]"></div>
          </div>

            <button className="z-10 text-left" onClick={() => window.location.assign('/')}>
              <BrandLogo size={48} roundedClassName="rounded-xl" className="mb-6 hover:scale-105 transition-transform" />
              <h1 className="text-3xl font-bold mb-2">ConnectAI</h1>
              <p className="text-brand-200">The AI-native contact center for modern SMBs.</p>
            </button>

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

        {/* Right: Auth Form */}
          <div className="p-6 md:p-12 flex flex-col justify-center w-full bg-gradient-to-b from-white to-slate-50/70">
          
          {/* Mobile Header (Visible only on mobile) */}
           <button className="md:hidden flex items-center gap-3 mb-8 text-left" onClick={() => window.location.assign('/')}>
             <BrandLogo size={40} roundedClassName="rounded-lg" />
             <h1 className="text-xl font-bold text-slate-900">ConnectAI</h1>
           </button>

          <div className="flex items-center gap-2 mb-6 bg-slate-100/50 p-1 rounded-xl w-full sm:w-fit">
            <button onClick={() => setMode('login')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Sign In</button>
            <button onClick={() => setMode('signup')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Sign Up</button>
          </div>

          <div className="mb-6">
             <h2 className="text-xl md:text-2xl font-bold text-slate-800 mb-1">{mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Reset password' : 'Welcome Back'}</h2>
             <p className="text-xs md:text-sm text-slate-500">{mode === 'reset' ? 'We\'ll email you a recovery link.' : 'Enter your credentials to access the workspace.'}</p>
          </div>

          <form onSubmit={mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handleReset} className="space-y-4">
            {mode === 'signup' && (
              <div className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl">
                <User size={16} className="text-slate-400" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="w-full outline-none text-sm"
                  required
                />
              </div>
            )}

            <div className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-200 transition-all">
              <Mail size={16} className="text-slate-400" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={handleEmailBlur}
                placeholder="Email address"
                type="email"
                className="w-full outline-none text-sm placeholder:text-slate-400"
                required
              />
            </div>

            {mode !== 'reset' && (
              <div className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-200 transition-all">
                <KeyRound size={16} className="text-slate-400" />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  type={showPassword ? 'text' : 'password'}
                  className="w-full outline-none text-sm placeholder:text-slate-400"
                  required
                />
                <button type="button" onClick={() => setShowPassword((prev) => !prev)} className="text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            )}

            {mode === 'signup' && (
              <div className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-200 transition-all">
                <KeyRound size={16} className="text-slate-400" />
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="w-full outline-none text-sm placeholder:text-slate-400"
                  required
                />
                <button type="button" onClick={() => setShowConfirmPassword((prev) => !prev)} className="text-slate-400 hover:text-slate-600">
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            )}

            {/* Role Selection Restored & Improved */}
            {mode !== 'reset' && (
               <div className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl focus-within:border-brand-500 transition-all">
                 <Shield size={16} className="text-slate-400" />
                 <select
                   className="w-full bg-transparent text-sm font-semibold text-slate-600 outline-none cursor-pointer"
                   value={role}
                   onChange={(e) => setRole(e.target.value as Role)}
                 >
                   <option value={Role.AGENT}>Agent Portal</option>
                   <option value={Role.SUPERVISOR}>Supervisor Dashboard</option>
                   <option value={Role.ADMIN}>Admin Console</option>
                 </select>
               </div>
            )}

            {mode === 'login' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={handlePendingInviteCta}
                  className="text-[11px] font-black uppercase tracking-widest text-brand-600 hover:text-brand-700 underline"
                >
                  Pending Invite? Create Account
                </button>
              </div>
            )}
            {mode === 'login' && (
              <div className="text-right -mt-1">
                <button type="button" onClick={() => setMode('reset')} className="text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700 underline">
                  Forgot Password?
                </button>
              </div>
            )}
            
            {error && (
               <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                  <AlertCircle size={16} className="shrink-0 text-red-500"/>
                  <span className="leading-tight">{error}</span>
               </div>
            )}
            
            {message && (
               <div className="bg-green-50 border border-green-100 text-green-700 p-3 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                  <CheckCircle size={16} className="shrink-0 text-green-500"/>
                  <span className="leading-tight">{message}</span>
               </div>
            )}

            {externalMessage && (
              <div className="bg-amber-50 border border-amber-100 text-amber-700 p-3 rounded-xl text-xs font-bold flex items-start justify-between gap-2">
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
              className="w-full py-3.5 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
            </button>

            {mode === 'login' && (
               <div className="relative py-2">
                 <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                 <div className="relative flex justify-center"><span className="bg-white px-4 text-[10px] font-black uppercase text-slate-300 tracking-widest">Or</span></div>
               </div>
            )}

            {mode === 'login' && (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={busy}
                className="w-full py-3.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-3 group"
              >
                <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                   <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                   <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                   <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05"/>
                   <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>Continue with Google</span>
              </button>
            )}
          </form>
          
          <div className="mt-8 flex items-center justify-center text-xs text-slate-400">
            <Lock size={12} className="mr-1" />
            <span>Secure 256-bit Encrypted Connection</span>
          </div>
        </div>
      </div>
    </div>
  );
};
