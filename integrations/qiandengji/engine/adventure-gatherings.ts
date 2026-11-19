type Gathering = { id: string; name: string; eventId: string; expiresAt: number; nextCommand: string };

/** AgentCoach sends at most four active WorldEvents. Attendance is a separate server receipt. */
export class AdventureGatherings {
  private readonly notices = new Map<string, Gathering>();
  current(now = Date.now()) {
    for (const [id, notice] of this.notices) if (notice.expiresAt <= now) this.notices.delete(id);
    return Array.from(this.notices.values(), notice => ({...notice}));
  }
  observe(text: string, recipient: string | undefined, now = Date.now()) {
    if (!recipient || !text.startsWith('MC_COACH ') || text.length > 4096) return;
    let v;
    try { v = JSON.parse(text.slice(9)); } catch { return; }
    if (!v || v.type !== 'adventure_gathering' || v.recipient !== recipient || v.requiresDecision !== true
      || v.participationAutomatic !== false || v.isTaskProgress !== false || v.progressMeaning !== 'event_time_remaining'
      || typeof v.id !== 'string' || !/^[a-z0-9_-]{1,80}$/.test(v.id) || !Number.isSafeInteger(v.expiresAt)
      || v.eventId !== v.id + ':' + v.expiresAt || v.expiresAt <= now || typeof v.name !== 'string'
      || !v.name.length || v.name.length > 120 || typeof v.nextCommand !== 'string' || !v.nextCommand.startsWith('/mycli ')
      || v.nextCommand.length > 160 || /[\u0000-\u001f\u007f]/.test(v.name+v.nextCommand)) return;
    this.current(now);
    const old = this.notices.get(v.id);
    if (old && old.expiresAt >= v.expiresAt) return;
    if (!old && this.notices.size >= 4) return;
    this.notices.set(v.id,{id:v.id,name:v.name,eventId:v.eventId,expiresAt:v.expiresAt,nextCommand:v.nextCommand});
  }
}
