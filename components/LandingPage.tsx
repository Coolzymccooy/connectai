import React, { useMemo } from 'react';
import { ArrowRight, CheckCircle2, Sparkles, PhoneCall, MessageSquare, ShieldCheck, BarChart3, Users, CalendarClock } from 'lucide-react';

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 shadow-sm">
    <span className="h-2 w-2 rounded-full bg-emerald-400" />
    {children}
  </div>
);

export const LandingPage: React.FC = () => {
  const hasSession = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(localStorage.getItem('connectai_auth_token'));
  }, []);

  const goApp = () => {
    if (typeof window === 'undefined') return;
    window.location.hash = '#/app';
  };

  const goLanding = () => {
    if (typeof window === 'undefined') return;
    window.location.hash = '';
    window.history.replaceState(null, '', '/');
  };

  return (
    <div className="landing-page h-screen min-h-screen overflow-y-auto bg-slate-950 text-slate-900">
      <div className="relative">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-40 h-[420px] w-[420px] rounded-full bg-emerald-400/30 blur-[120px]" />
          <div className="absolute top-20 right-[-120px] h-[360px] w-[360px] rounded-full bg-cyan-400/25 blur-[120px]" />
          <div className="absolute bottom-[-220px] left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-indigo-400/20 blur-[160px]" />
        </div>

        <header className="relative z-10 mx-auto flex w-full max-w-none items-center justify-between px-6 pb-8 pt-10 text-white md:px-10 xl:px-16 2xl:px-24">
          <button onClick={goLanding} className="flex items-center gap-3 text-left focus:outline-none">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-xl font-black italic tracking-tight">C</div>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/60">ConnectAI</p>
              <div className="flex items-center gap-3">
                <p className="text-lg font-semibold">Contact Center Suite</p>
                <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  Tech by Tiwaton
                </span>
              </div>
            </div>
          </button>
          <div className="flex items-center gap-3">
            {hasSession && (
              <button onClick={goApp} className="rounded-full border border-emerald-300/60 bg-emerald-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100 transition hover:border-emerald-200 hover:text-white">
                Return to App
              </button>
            )}
            <button onClick={goApp} className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/80 transition hover:border-white/60 hover:text-white">Launch App</button>
            <a href="#demo" className="rounded-full bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-900 transition hover:translate-y-[-1px] hover:shadow-lg">Book a Demo</a>
          </div>
        </header>

        <main className="relative z-10">
          <section className="mx-auto flex w-full max-w-none flex-col gap-12 px-6 pb-24 pt-6 text-white lg:flex-row lg:items-center md:px-10 xl:px-16 2xl:px-24">
            <div className="flex-1">
              <SectionLabel>AI-First Contact Center</SectionLabel>
              <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
                One workspace to call, chat, and coach every customer conversation.
              </h1>
              <p className="mt-5 text-lg text-white/70">
                ConnectAI gives modern SMBs a fast, elegant command center for voice, chat, and call intelligence. Replace scattered tools with a single, AI-ready workflow.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={goApp} className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300">
                  Start a Demo
                  <ArrowRight size={16} />
                </button>
                <a href="#features" className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white/90 transition hover:border-white/70">
                  See Features
                </a>
              </div>
              <div className="mt-10 grid grid-cols-2 gap-6 text-sm text-white/70">
                <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-300" /> Unified call + chat workflows</div>
                <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-300" /> AI call summaries & recap</div>
                <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-300" /> Supervisor insights & coaching</div>
                <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-300" /> Secure, role-based access</div>
              </div>
            </div>
            <div className="flex-1">
              <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">Live Workspace</p>
                  <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-emerald-200">Online</span>
                </div>
                <div className="mt-6 grid gap-4">
                  {[
                    { title: 'Active Calls', value: '18', icon: PhoneCall },
                    { title: 'Pending Chats', value: '42', icon: MessageSquare },
                    { title: 'Compliance Score', value: '98%', icon: ShieldCheck },
                  ].map((item) => (
                    <div key={item.title} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><item.icon size={18} /></div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-white/50">{item.title}</p>
                          <p className="text-lg font-semibold">{item.value}</p>
                        </div>
                      </div>
                      <Sparkles size={16} className="text-emerald-300" />
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-5 text-sm text-white/70">
                  AI summary: "Customer requested a follow-up on Tuesday. Next best action: send calendar invite and confirmation SMS."
                </div>
                <div className="mt-5 flex items-center justify-between rounded-2xl border border-emerald-200/20 bg-emerald-300/10 px-4 py-3 text-[11px] uppercase tracking-[0.3em] text-emerald-100">
                  <span className="flex items-center gap-2">
                    <Sparkles size={14} className="text-emerald-200" />
                    Tech by Tiwaton
                  </span>
                  <span className="text-[10px] tracking-[0.4em] text-emerald-200/80">Trusted Build</span>
                </div>
              </div>
            </div>
          </section>

          <section id="features" className="mx-auto w-full max-w-none px-6 pb-24 md:px-10 xl:px-16 2xl:px-24">
            <div className="rounded-[36px] bg-white px-8 py-16 shadow-2xl">
              <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <SectionLabel>What You Get</SectionLabel>
                  <h2 className="mt-4 text-3xl font-black text-slate-900" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>Everything a modern contact center needs.</h2>
                  <p className="mt-3 text-slate-500">Call, message, and manage every customer journey in one clear workflow.</p>
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-500">
                  <div className="flex items-center gap-2"><BarChart3 size={16} className="text-emerald-500" /> Live analytics</div>
                  <div className="flex items-center gap-2"><Users size={16} className="text-emerald-500" /> Team controls</div>
                  <div className="flex items-center gap-2"><CalendarClock size={16} className="text-emerald-500" /> Smart scheduling</div>
                </div>
              </div>
              <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[
                  { title: 'AI Softphone', desc: 'Place and receive calls with real-time notes, summaries, and call logs.' },
                  { title: 'Unified Inbox', desc: 'Keep all customer messages and follow-ups in one shared view.' },
                  { title: 'Call Intelligence', desc: 'Transcripts, recordings, recap, and next-best actions in seconds.' },
                  { title: 'Supervisor Console', desc: 'Monitor live activity, coach agents, and keep SLAs tight.' },
                  { title: 'Admin Control Center', desc: 'Manage IVR, numbers, team access, and compliance settings.' },
                  { title: 'Multi-Company Ready', desc: 'Tenant-based setup for onboarding multiple businesses.' },
                ].map((item) => (
                  <div key={item.title} className="rounded-3xl border border-slate-100 bg-slate-50 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                    <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-3 text-sm text-slate-500">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mx-auto w-full max-w-none px-6 pb-24 text-white md:px-10 xl:px-16 2xl:px-24">
            <div className="grid gap-8 rounded-[36px] border border-white/10 bg-white/5 p-10 lg:grid-cols-[1.1fr_1fr]">
              <div>
                <SectionLabel>Who It Helps</SectionLabel>
                <h3 className="mt-4 text-3xl font-black" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>Built for teams that live on calls.</h3>
                <p className="mt-4 text-white/70">Sales, support, and client success teams that need speed, clarity, and accountability.</p>
                <ul className="mt-6 space-y-3 text-sm text-white/70">
                  <li className="flex items-start gap-3"><CheckCircle2 size={16} className="mt-0.5 text-emerald-300" /> Rapid onboarding for new agents</li>
                  <li className="flex items-start gap-3"><CheckCircle2 size={16} className="mt-0.5 text-emerald-300" /> Visibility into call quality and outcomes</li>
                  <li className="flex items-start gap-3"><CheckCircle2 size={16} className="mt-0.5 text-emerald-300" /> AI recaps to reduce manual logging</li>
                </ul>
              </div>
              <div className="rounded-3xl bg-white/10 p-6">
                <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">How it works</h4>
                <ol className="mt-6 space-y-4 text-sm text-white/70">
                  <li className="flex gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-200">1</span> Create your company workspace</li>
                  <li className="flex gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-200">2</span> Invite your team and assign roles</li>
                  <li className="flex gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-200">3</span> Call, track, and optimize conversations</li>
                </ol>
              </div>
            </div>
          </section>

          <section id="demo" className="mx-auto w-full max-w-none px-6 pb-24 md:px-10 xl:px-16 2xl:px-24">
            <div className="rounded-[36px] bg-emerald-400 px-8 py-14 text-slate-900 shadow-2xl">
              <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-3xl font-black" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>Ready to modernize your contact center?</h3>
                  <p className="mt-3 text-sm text-slate-800/80">Launch the app, invite your team, and start calling today.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={goApp} className="rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">Launch App</button>
                  <a href="mailto:hello@connectai.app" className="rounded-full border border-slate-900/30 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-900">Talk to Sales</a>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};
