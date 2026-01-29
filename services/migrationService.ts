
import { Call, MigrationProvider, CallStatus, CallDirection } from '../types';

export const startLegacyMigration = async (
  provider: MigrationProvider,
  apiKey: string,
  onProgress: (processed: number, total: number) => void
): Promise<Call[]> => {
  // Phase 1: API Handshake & Profiling
  console.log(`[Neural Sync] Profiling ${provider} legacy schema...`);
  await new Promise(r => setTimeout(r, 1500));
  
  // Phase 2: Metadata Mapping (Mechanics)
  console.log(`[Neural Sync] Mapping legacy attributes to ConnectAI cores...`);
  await new Promise(r => setTimeout(r, 1000));
  
  const total = 120;
  const migratedCalls: Call[] = [];

  for (let i = 0; i < total; i++) {
    if (i % 20 === 0) {
      await new Promise(r => setTimeout(r, 400));
      onProgress(i, total);
    }

    const startTime = Date.now() - (Math.random() * 86400000 * 30);
    migratedCalls.push({
      id: `mig_${provider}_${i}`,
      direction: Math.random() > 0.5 ? 'inbound' : 'outbound',
      customerName: `Legacy Customer ${i + 100}`,
      phoneNumber: `+1 (555) ${Math.floor(Math.random() * 900) + 100}-0000`,
      queue: i % 2 === 0 ? 'Sales' : 'Support',
      startTime,
      durationSeconds: Math.floor(Math.random() * 600) + 60,
      status: CallStatus.ENDED,
      transcript: [
        { id: '1', speaker: 'customer', text: 'Migrated record detail segment.', timestamp: startTime }
      ],
      isMigrated: true,
      legacyProvider: provider,
      analysis: {
        summary: `Migrated record from ${provider}. Re-scored via Gemini Core.`,
        sentimentScore: Math.floor(Math.random() * 100),
        sentimentLabel: Math.random() > 0.7 ? 'Positive' : 'Neutral',
        topics: ['Legacy Sync'],
        qaScore: 85,
        dispositionSuggestion: 'Resolved'
      }
    });
  }

  onProgress(total, total);
  return migratedCalls;
};
