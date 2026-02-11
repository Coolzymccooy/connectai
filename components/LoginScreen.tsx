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
      const policyCheck = await enforcePolicy(email);
      if (policyCheck.error) {
        setError(policyCheck.error);
        setBusy(false);
        return;
      }

      const result = await signInWithEmailAndPassword(auth, email, password);
      const user = result.user;
      
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
      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 bg-white rounded-2xl shadow-xl overflow-hidden min-h-[560px] border border-slate-100">
        {/* Left: Brand Side (Restored Original Blue) */}
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

        {/* Right: Auth Form */}
        <div className="p-12 flex flex-col justify-center">
          
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setMode('login')} className={`px-4 py-2 rounded-xl text-sm font-bold ${mode === 'login' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Sign In</button>
            <button onClick={() => setMode('signup')} className={`px-4 py-2 rounded-xl text-sm font-bold ${mode === 'signup' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Create Account</button>
            <button onClick={() => setMode('reset')} className={`px-4 py-2 rounded-xl text-sm font-bold ${mode === 'reset' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Forgot Password</button>
          </div>

          <div className="mb-6">
             <h2 className="text-2xl font-bold text-slate-800 mb-2">{mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome Back'}</h2>
             <p className="text-slate-500">{mode === 'reset' ? 'Enter your email to receive a recovery link.' : 'Use email authentication for a persistent session.'}</p>
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

            <div className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl">
              <Mail size={16} className="text-slate-400" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={handleEmailBlur}
                placeholder="Email address"
                type="email"
                className="w-full outline-none text-sm"
                required
              />
            </div>

            {mode !== 'reset' && (
              <div className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl">
                <KeyRound size={16} className="text-slate-400" />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  type="password"
                  className="w-full outline-none text-sm"
                  required
                />
              </div>
            )}

            {mode === 'signup' && (
              <div className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl">
                <Shield size={16} className="text-slate-400" />
                <select
                  className="w-full bg-transparent text-sm font-semibold text-slate-600 outline-none"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value={Role.AGENT}>Agent</option>
                  <option value={Role.SUPERVISOR}>Supervisor</option>
                  <option value={Role.ADMIN}>Admin</option>
                </select>
              </div>
            )}
            
            {error && (
               <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-xs font-bold flex items-start gap-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5"/>
                  <span>{error}</span>
               </div>
            )}
            
            {message && (
               <div className="bg-green-50 border border-green-100 text-green-700 p-3 rounded-xl text-xs font-bold flex items-start gap-2">
                  <CheckCircle size={14} className="shrink-0 mt-0.5"/>
                  <span>{message}</span>
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
              className="w-full py-3 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 transition-all flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
            </button>

            {mode === 'login' && (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={busy}
                className="w-full py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
              >
                Continue with Google
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

