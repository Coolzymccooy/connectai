
import React, { useState, useEffect, useRef } from 'react';
import { Play, Download, Search, Filter, Calendar, ArrowUpRight, ArrowDownLeft, ArrowRightLeft, Clock, User, Phone } from 'lucide-react';
import { Call, CallDirection, CallStatus } from '../types';
import { fetchCallLogs, CallLogFilters } from '../services/callLogService';
import { getRecordingSignedUrl } from '../services/recordingService';

interface CallLogViewProps {
    currentUser: { id: string; role: string };
}

export const CallLogView: React.FC<CallLogViewProps> = ({ currentUser }) => {
    const [calls, setCalls] = useState<Call[]>([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState<CallLogFilters>({
        agentId: currentUser.role === 'AGENT' ? currentUser.id : undefined,
    });
    const [searchText, setSearchText] = useState('');
    const [minDuration, setMinDuration] = useState('');
    const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
    const [playbackError, setPlaybackError] = useState<string | null>(null);
    const playbackAudioRef = useRef<HTMLAudioElement | null>(null);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            let results = await fetchCallLogs(filters);
            const query = searchText.trim().toLowerCase();
            if (query) {
                results = results.filter(call => {
                    return (
                        call.customerName?.toLowerCase().includes(query) ||
                        call.phoneNumber?.toLowerCase().includes(query) ||
                        call.customerEmail?.toLowerCase().includes(query) ||
                        call.agentName?.toLowerCase().includes(query) ||
                        call.agentEmail?.toLowerCase().includes(query)
                    );
                });
            }
            const min = Number(minDuration);
            if (Number.isFinite(min) && min > 0) {
                results = results.filter(call => (call.durationSeconds || 0) >= min);
            }
            setCalls(results);
        } catch (err) {
            console.error('Failed to fetch logs', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [filters, searchText, minDuration]);

    useEffect(() => {
        if (!playbackUrl || !playbackAudioRef.current) return;
        const audioEl = playbackAudioRef.current;
        audioEl.muted = false;
        audioEl.volume = 1;
        audioEl.play().catch(() => {
            setPlaybackError('Browser blocked autoplay. Press play on the recorder control.');
        });
    }, [playbackUrl]);

    const handleApplyFilter = (key: keyof CallLogFilters, value: any) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const extractRecordingId = (call: Call) => {
        if (call.recordingId) return call.recordingId;
        if (!call.recordingUrl) return call.status === CallStatus.ENDED ? call.id : '';
        const tokenMatch = call.recordingUrl.match(/[?&]token=([^&]+)/);
        if (!tokenMatch) {
            return call.status === CallStatus.ENDED ? call.id : '';
        }
        const token = tokenMatch[1];
        const parts = token.split('.');
        const extracted = parts.length >= 2 ? parts[1] : '';
        if (extracted) return extracted;
        return call.status === CallStatus.ENDED ? call.id : '';
    };

    const resolveRecordingUrl = async (call: Call) => {
        const recordingId = extractRecordingId(call);
        if (!recordingId) return '';
        const response = await getRecordingSignedUrl(recordingId, 3600);
        return response?.url || '';
    };

    const handlePlay = async (call: Call) => {
        try {
            const url = await resolveRecordingUrl(call);
            if (!url) {
                alert("No recording available for this call.");
                return;
            }
            setPlaybackUrl(url);
            setPlaybackError(null);
        } catch {
            alert("Recording access denied or unavailable.");
        }
    };

    const handleDownload = async (call: Call) => {
        try {
            const url = await resolveRecordingUrl(call);
            if (!url) {
                alert("No recording available for this call.");
                return;
            }
            const downloadUrl = `${url}${url.includes('?') ? '&' : '?'}download=1`;
            const anchor = document.createElement('a');
            anchor.href = downloadUrl;
            anchor.download = '';
            anchor.rel = 'noopener';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
        } catch {
            alert("Recording access denied or unavailable.");
        }
    };

    const hasRecording = (call: Call) => Boolean(extractRecordingId(call));

    const handleExportCsv = () => {
        if (!calls.length) {
            alert('No calls to export.');
            return;
        }
        const header = ['id', 'date', 'direction', 'customerName', 'customerEmail', 'phoneNumber', 'agentName', 'agentEmail', 'durationSeconds', 'status', 'recordingUrl'];
        const rows = calls.map(call => ([
            call.id,
            new Date(call.startTime).toISOString(),
            call.direction,
            call.customerName || '',
            call.customerEmail || '',
            call.phoneNumber || '',
            call.agentName || '',
            call.agentEmail || '',
            String(call.durationSeconds || 0),
            call.status,
            call.recordingUrl || ''
        ]));
        const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/\"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `connectai-call-logs-${Date.now()}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    };

    const formatDuration = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const formatDate = (ts: number) => {
        return new Date(ts).toLocaleString();
    };

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <div className="p-8 pb-4">
                <h2 className="text-3xl font-black text-slate-800 tracking-tighter italic uppercase mb-6">Call Logs</h2>

                {/* Filters */}
                <div className="flex flex-wrap gap-3 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                        <Calendar size={16} className="text-slate-400" />
                        <select
                            className="bg-transparent text-sm font-semibold text-slate-600 outline-none"
                            onChange={(e) => {
                                const val = e.target.value;
                                const now = Date.now();
                                let start = 0;
                                if (val === 'today') start = now - 86400000;
                                if (val === 'week') start = now - 7 * 86400000;
                                if (val === 'month') start = now - 30 * 86400000;
                                handleApplyFilter('startDate', start > 0 ? start : undefined);
                            }}
                        >
                            <option value="all">All Time</option>
                            <option value="today">Last 24 Hours</option>
                            <option value="week">Last 7 Days</option>
                            <option value="month">Last 30 Days</option>
                        </select>
                    </div>

                    {currentUser.role !== 'AGENT' && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                            <User size={16} className="text-slate-400" />
                            <input
                                type="text"
                                placeholder="Agent ID"
                                value={filters.agentId || ''}
                                onChange={(e) => handleApplyFilter('agentId', e.target.value || undefined)}
                                className="bg-transparent text-sm font-semibold text-slate-600 outline-none w-28"
                            />
                        </div>
                    )}

                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                        <Filter size={16} className="text-slate-400" />
                        <select
                            className="bg-transparent text-sm font-semibold text-slate-600 outline-none"
                            onChange={(e) => handleApplyFilter('direction', e.target.value || undefined)}
                        >
                            <option value="">All Directions</option>
                            <option value="inbound">Inbound</option>
                            <option value="outbound">Outbound</option>
                            <option value="internal">Internal</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                        <Phone size={16} className="text-slate-400" />
                        <select
                            className="bg-transparent text-sm font-semibold text-slate-600 outline-none"
                            onChange={(e) => handleApplyFilter('status', e.target.value || undefined)}
                        >
                            <option value="">All Statuses</option>
                            <option value="ENDED">Completed</option>
                            <option value="MISSED">Missed</option>
                            <option value="FAILED">Failed</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                        <Search size={16} className="text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search name/email/phone"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            className="bg-transparent text-sm font-semibold text-slate-600 outline-none w-48"
                        />
                    </div>

                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                        <Clock size={16} className="text-slate-400" />
                        <input
                            type="number"
                            min={0}
                            placeholder="Min sec"
                            value={minDuration}
                            onChange={(e) => setMinDuration(e.target.value)}
                            className="bg-transparent text-sm font-semibold text-slate-600 outline-none w-20"
                        />
                    </div>

                    <button
                        onClick={fetchLogs}
                        className="ml-auto px-6 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all flex items-center gap-2"
                    >
                        <Search size={16} /> Refresh
                    </button>
                    <button
                        onClick={handleExportCsv}
                        className="px-6 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all flex items-center gap-2"
                    >
                        <Download size={16} /> Export CSV
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto px-8 pb-8">
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest text-slate-500">Date & Time</th>
                                <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest text-slate-500">Agent</th>
                                <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest text-slate-500">Customer</th>
                                <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest text-slate-500">Direction</th>
                                <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest text-slate-500">Duration</th>
                                <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest text-slate-500">Status</th>
                                <th className="px-6 py-4 text-right text-xs font-black uppercase tracking-widest text-slate-500">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-medium">Loading logs...</td></tr>
                            ) : calls.length === 0 ? (
                                <tr><td colSpan={7} className="p-8 text-center text-slate-400 font-medium">No calls found.</td></tr>
                            ) : (
                                calls.map(call => (
                                    <tr key={call.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-700 text-sm">{formatDate(call.startTime)}</span>
                                                <span className="text-[10px] text-slate-400 font-mono">{call.id}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-800 text-sm">{call.agentName || call.agentId || 'Unknown'}</span>
                                                <span className="text-xs text-slate-500">{call.agentEmail || call.agentExtension || '—'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-800 text-sm">{call.customerName || 'Unknown'}</span>
                                                <span className="text-xs text-slate-500">{call.phoneNumber || call.customerExtension || '—'}</span>
                                                <span className="text-[10px] text-slate-400">{call.customerEmail || '—'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {call.direction === 'inbound' && <ArrowDownLeft size={16} className="text-green-500" />}
                                                {call.direction === 'outbound' && <ArrowUpRight size={16} className="text-blue-500" />}
                                                {call.direction === 'internal' && <ArrowRightLeft size={16} className="text-purple-500" />}
                                                <span className="text-sm font-medium text-slate-600 capitalize">{call.direction}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-slate-600 font-mono text-sm">
                                                <Clock size={14} className="text-slate-400" />
                                                {formatDuration(call.durationSeconds)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide
                        ${call.status === 'ENDED' ? 'bg-green-100 text-green-700' :
                                                    call.status === 'MISSED' ? 'bg-red-100 text-red-700' :
                                                        'bg-slate-100 text-slate-700'}`}>
                                                {call.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handlePlay(call)}
                                                    disabled={!hasRecording(call)}
                                                    className={`p-2 rounded-xl transition-all ${hasRecording(call) ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                                                    title="Play Recording"
                                                >
                                                    <Play size={16} fill={hasRecording(call) ? "currentColor" : "none"} />
                                                </button>
                                                <button
                                                    onClick={() => handleDownload(call)}
                                                    disabled={!hasRecording(call)}
                                                    className={`p-2 rounded-xl transition-all ${hasRecording(call) ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                                                    title="Download Recording"
                                                >
                                                    <Download size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Playback Modal / Bar */}
            {playbackUrl && (
                <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-white/10 p-4 z-[60] flex items-center gap-4 animate-in slide-in-from-bottom">
                    <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center text-white shrink-0">
                        <Play size={20} fill="currentColor" />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-white font-bold text-sm">Playing Recording</h4>
                        <p className="text-slate-400 text-xs truncate">{playbackUrl}</p>
                        {playbackError && <p className="text-amber-300 text-[11px] mt-1">{playbackError}</p>}
                    </div>
                    <audio
                        ref={playbackAudioRef}
                        controls
                        src={playbackUrl}
                        autoPlay
                        className="h-8 w-64"
                        preload="metadata"
                        onPlay={() => setPlaybackError(null)}
                        onError={() => setPlaybackError('Recording stream failed. Refresh token and try again.')}
                    />
                    <button onClick={() => { setPlaybackUrl(null); setPlaybackError(null); }} className="text-slate-400 hover:text-white px-4">Close</button>
                </div>
            )}
        </div>
    );
};

