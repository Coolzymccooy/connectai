                    <input type="text" placeholder="Search roster..." className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-xs font-bold outline-none focus:border-brand-500 shadow-lg transition-all" />
                 </div>
              </div>
                <div className="flex-1 bg-white rounded-[2rem] border border-slate-200 shadow-xl p-6 overflow-y-auto scrollbar-hide">
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[user, ...user.role === 'ADMIN' ? [] : []].map(u => (
                         <div key={u.id} className="flex items-center gap-4 p-4 border border-slate-100 rounded-2xl hover:border-brand-200 hover:bg-brand-50/50 transition-all group">
                            <div className="relative">
                               <img src={u.avatarUrl} className="w-12 h-12 rounded-xl border border-slate-200 shadow-sm" />
                               <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${u.currentPresence === 'AVAILABLE' ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                            </div>
                            <div className="flex-1">
                               <p className="font-bold text-slate-800 text-sm">{u.name}</p>
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{u.role}</p>
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                               <button onClick={() => handleInternalLink(u, false)} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-brand-600 hover:border-brand-200 shadow-sm"><Phone size={14}/></button>
                               <button onClick={() => handleInternalLink(u, true)} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-brand-600 hover:border-brand-200 shadow-sm"><Video size={14}/></button>
                               <button onClick={() => handleMessageTeammate(u)} className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-brand-600 hover:border-brand-200 shadow-sm"><MessageSquare size={14}/></button>
                            </div>
                         </div>
                      ))}
                   </div>
                </div>
             </div>
        )}

      {/* Campaign Creation Modal */}
      {showCampaignModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 md:p-6 animate-in fade-in">
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden relative">
              <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center shrink-0">
                 <div>
                    <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800">Orchestrate Wave</h3>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">New Campaign</p>
                 </div>
                 <button onClick={() => setShowCampaignModal(false)} className="p-3 hover:bg-slate-50 rounded-xl transition-all"><X size={20} className="text-slate-400"/></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 scrollbar-hide">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Campaign Name</label>
                          <input 
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-4 font-bold text-sm outline-none focus:border-brand-500"
                            placeholder="e.g., Q3 Re-engagement"
                            value={newCampaign.name}
                            onChange={e => setNewCampaign({...newCampaign, name: e.target.value})}
                          />
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Channel Type</label>
                          <div className="flex gap-2">
                             {['call', 'sms', 'email', 'whatsapp'].map(t => (
                                <button 
                                  key={t}
                                  onClick={() => setNewCampaign({...newCampaign, type: t as any})}
                                  className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all ${newCampaign.type === t ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'}`}
                                >
                                   {t}
                                </button>
                             ))}
                          </div>
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Volume</label>
                          <div className="flex items-center gap-4 bg-slate-50 border-2 border-slate-100 rounded-xl p-4">
                             <Target size={20} className="text-brand-500"/>
                             <input 
                               type="number"
                               className="bg-transparent font-black text-xl outline-none w-full"
                               value={newCampaign.target}
                               onChange={e => setNewCampaign({...newCampaign, target: parseInt(e.target.value)})}
                             />
                             <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Leads</span>
                          </div>
                       </div>
                    </div>

                    <div className="space-y-6">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Message Style</label>
                          <div className="grid grid-cols-2 gap-2">
                             {['Professional Concierge', 'Friendly Assistant', 'Technical Handoff', 'Closing Logic'].map(p => (
                                <button 
                                  key={p}
                                  onClick={() => setNewCampaign({...newCampaign, persona: p})}
                                  className={`py-3 px-2 rounded-xl text-[8px] font-black uppercase tracking-widest border-2 transition-all truncate ${newCampaign.persona === p ? 'border-brand-900 bg-brand-900 text-white' : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'}`}
                                >
                                   {p}
                                </button>
                             ))}
                          </div>
                       </div>
                       
                       <div className="space-y-4 pt-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Audience</label>
                          <div className="grid grid-cols-2 gap-3">
                             <input className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold outline-none" placeholder="Industry" value={newCampaign.audience.industry} onChange={e => setNewCampaign({...newCampaign, audience: {...newCampaign.audience, industry: e.target.value}})} />
                             <select className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold outline-none" value={newCampaign.audience.lifecycleStage} onChange={e => setNewCampaign({...newCampaign, audience: {...newCampaign.audience, lifecycleStage: e.target.value}})}>
                                <option>Lead</option><option>MQL</option><option>SQL</option><option>Customer</option>
                             </select>
                             <select className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold outline-none" value={newCampaign.audience.region} onChange={e => setNewCampaign({...newCampaign, audience: {...newCampaign.audience, region: e.target.value}})}>
                                <option>UK</option><option>US</option><option>EU</option><option>APAC</option>
                             </select>
                             <input type="number" className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold outline-none" placeholder="Min Score" value={newCampaign.audience.minEngagement} onChange={e => setNewCampaign({...newCampaign, audience: {...newCampaign.audience, minEngagement: parseInt(e.target.value)}})} />
                          </div>
                          <label className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-500 cursor-pointer">
                             <input type="checkbox" checked={newCampaign.audience.consentRequired} onChange={e => setNewCampaign({...newCampaign, audience: {...newCampaign.audience, consentRequired: e.target.checked}})} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                             Consent Required
                          </label>
                       </div>
                    </div>
                 </div>

                 {newCampaign.type !== 'call' && (
                    <div className="pt-6 border-t border-slate-100 animate-in slide-in-from-bottom-4">
                       <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Journey Steps</h4>
                       <div className="space-y-3">
                          {newCampaign.journey.map((step, idx) => (
                             <div key={step.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                <span className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-[10px] font-black border border-slate-200 text-slate-400">{idx + 1}</span>
                                <select className="bg-transparent text-[10px] font-black uppercase tracking-widest outline-none w-32" value={step.type} onChange={e => {
                                   const next = [...newCampaign.journey];
                                   next[idx].type = e.target.value as any;
                                   setNewCampaign({...newCampaign, journey: next});
                                }}>
                                   <option value="send_email">Send Email</option>
                                   <option value="send_sms">Send SMS</option>
                                   <option value="wait">Wait</option>
                                   <option value="notify_sales">Notify Sales</option>
                                </select>
                                <input className="flex-1 bg-transparent text-xs font-bold outline-none" value={step.label} onChange={e => {
                                   const next = [...newCampaign.journey];
                                   next[idx].label = e.target.value;
                                   setNewCampaign({...newCampaign, journey: next});
                                }} />
                                <button onClick={() => {
                                   const next = newCampaign.journey.filter((_, i) => i !== idx);
                                   setNewCampaign({...newCampaign, journey: next});
                                }} className="p-2 hover:bg-white rounded-lg text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={14}/></button>
                             </div>
                          ))}
                          <button onClick={() => setNewCampaign({...newCampaign, journey: [...newCampaign.journey, { id: `step_${Date.now()}`, type: 'wait', label: 'New Step' }]})} className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:border-brand-200 hover:text-brand-500 transition-all">+ Add Step</button>
                       </div>
                    </div>
                 )}
              </div>

              <div className="p-6 md:p-8 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-end gap-4">
                 <button onClick={() => setShowCampaignModal(false)} className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800">Cancel</button>
                 <button onClick={provisionCampaign} className="px-10 py-4 bg-brand-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-brand-800 transition-all flex items-center gap-2">
                    <Zap size={14} className="fill-current"/> Launch Wave
                 </button>
              </div>
           </div>
        </div>
      )}
      
      {/* Lead Creation Modal */}
      {showLeadModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden p-8">
              <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800 mb-6">Add New Node</h3>
              <div className="space-y-4">
                 <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none focus:border-brand-500" placeholder="Full Name" value={newLead.name} onChange={e => setNewLead({...newLead, name: e.target.value})} />
                 <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none focus:border-brand-500" placeholder="Company" value={newLead.company} onChange={e => setNewLead({...newLead, company: e.target.value})} />
                 <div className="grid grid-cols-2 gap-4">
                    <input className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none focus:border-brand-500" placeholder="Phone" value={newLead.phone} onChange={e => setNewLead({...newLead, phone: e.target.value})} />
                    <input className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none focus:border-brand-500" placeholder="Email" value={newLead.email} onChange={e => setNewLead({...newLead, email: e.target.value})} />
                 </div>
                 <textarea className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none focus:border-brand-500 h-24 resize-none" placeholder="Notes..." value={newLead.notes} onChange={e => setNewLead({...newLead, notes: e.target.value})} />
                 <div className="flex gap-3 pt-2">
                    <button onClick={() => setShowLeadModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200">Cancel</button>
                    <button onClick={handleCreateLead} className="flex-1 py-4 bg-brand-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-brand-800">Add Lead</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Schedule Meeting Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
           <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8">
              <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-800 mb-6">Schedule Session</h3>
              <div className="space-y-4">
                 <input className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none" placeholder="Meeting Title" value={newMeeting.title} onChange={e => setNewMeeting({...newMeeting, title: e.target.value})} />
                 <div className="grid grid-cols-2 gap-4">
                    <input type="date" className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none" value={newMeeting.date} onChange={e => setNewMeeting({...newMeeting, date: e.target.value})} />
                    <input type="time" className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none" value={newMeeting.time} onChange={e => setNewMeeting({...newMeeting, time: e.target.value})} />
                 </div>
                 <div className="flex items-center gap-3 p-4 border border-slate-100 rounded-xl">
                    <input type="checkbox" checked={newMeeting.isRecurring} onChange={e => setNewMeeting({...newMeeting, isRecurring: e.target.checked})} className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recurring?</span>
                    {newMeeting.isRecurring && (
                       <select className="ml-auto bg-slate-50 text-[10px] font-bold outline-none p-1 rounded" value={newMeeting.pattern} onChange={e => setNewMeeting({...newMeeting, pattern: e.target.value as any})}>
                          <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                       </select>
                    )}
                 </div>
                 <div className="flex gap-3 pt-4">
                    <button onClick={() => setShowScheduleModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest">Cancel</button>
                    <button onClick={() => {
                       const start = new Date(`${newMeeting.date}T${newMeeting.time}`).getTime();
                       const meeting: Meeting = {
                          id: `mtg_${Date.now()}`,
                          title: newMeeting.title,
                          startTime: start,
                          duration: 30,
                          organizerId: user.id,
                          attendees: [{ userId: user.id, status: 'accepted' }],
                          description: 'Scheduled via Console',
                          status: 'upcoming',
                          isRecurring: newMeeting.isRecurring,
                          recurrencePattern: newMeeting.isRecurring ? newMeeting.pattern : undefined
                       };
                       onUpdateMeetings([...meetings, meeting]);
                       setShowScheduleModal(false);
                       addNotification('success', 'Meeting scheduled.');
                    }} className="flex-1 py-4 bg-brand-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl">Confirm</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};