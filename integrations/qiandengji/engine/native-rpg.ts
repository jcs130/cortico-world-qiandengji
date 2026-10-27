/** Read-only protocol projections from the published Paper/Vortex bridge.
 * Source: minecraft-ai-friend/paper, native RPG release 420d6d32.
 * MC_RPG has several distinct response shapes; it is not a spell list envelope.
 */
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => number(value) && value >= 0;
const points = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9_:-]{0,63}$/i.test(value);

export interface NativeSkills { observedAt: string; available: string[]; common: string[]; learnable: string[]; skillPoints: number }
export function readNativeSkills(value: unknown, at: string, saved = false): NativeSkills | null {
  if (!object(value) || !Number.isFinite(Date.parse(at))) return null;
  const ids = (values: unknown): string[] | null => Array.isArray(values) && values.length <= 256 && values.every(id)
    ? [...new Set(values as string[])] : null;
  const available = ids(value.available), common = ids(value.common);
  const learnable = ids(saved ? value.learnable : Array.isArray(value.learnable)
    ? value.learnable.map(v => object(v) ? v.id : null) : null);
  return available && common && learnable && points(value.skillPoints)
    ? { observedAt: at, available, common, learnable, skillPoints: value.skillPoints } : null;
}

export function nativeRpgMessage(text: string): Record<string, unknown> | null {
  if (text.length > 65_536 || !text.startsWith('MC_RPG ') || /[\r\n]/.test(text)) return null;
  try { const value = JSON.parse(text.slice(7)); return object(value) ? value : null; } catch { return null; }
}

export interface NativeRpgProfile {
  available: boolean; classId?: string; level?: number; xp?: number; nextLevelXp?: number;
  mana?: { current: number; max: number }; skillPoints?: number; activeSkill?: string;
  economy?: { available: boolean; balance: number | null }; preview?: boolean;
}
function economy(value: unknown): NativeRpgProfile['economy'] {
  if (!object(value) || typeof value.available !== 'boolean') return undefined;
  // Some Vault adapters return zero while unavailable. Do not publish that as money owned.
  return { available: value.available, balance: value.available && number(value.balance) ? value.balance : null };
}
function mana(current: unknown, max: unknown): NativeRpgProfile['mana'] {
  return nonnegative(current) && nonnegative(max) && current <= max ? { current, max } : undefined;
}
export function readNativeRpgStatus(value: unknown): NativeRpgProfile | null {
  if (!object(value) || value.authority !== 'VortexRPG' || !id(value.class)
    || !points(value.level) || !nonnegative(value.xp) || !nonnegative(value.nextLevelXp)
    || !mana(value.mana, value.maxMana) || typeof value.preview !== 'boolean' || !economy(value.economy)) return null;
  return { available: true, classId: value.class, level: value.level, xp: value.xp, nextLevelXp: value.nextLevelXp,
    mana: mana(value.mana, value.maxMana), economy: economy(value.economy), preview: value.preview };
}
export function readNativeRpgPacket(channel: unknown, data: unknown): NativeRpgProfile | null {
  if (channel !== 'mcagent:state' || !Buffer.isBuffer(data) || data.length > 65_536) return null;
  let payload: unknown; try { payload = JSON.parse(data.toString('utf8')); } catch { return null; }
  if (!object(payload) || payload.schemaVersion !== 1 || !object(payload.profession)) return null;
  const value = payload.profession;
  if (value.backend !== 'vortex' || typeof value.available !== 'boolean') return null;
  if (!value.available) return { available: false };
  if (!(value.combat === '' || id(value.combat)) || !points(value.level) || !nonnegative(value.xp)
    || !points(value.skillPoints) || !(value.activeSkill === '' || id(value.activeSkill))) return null;
  const m = object(value.mana) ? mana(value.mana.current, value.mana.max) : undefined;
  return { available: true, classId: value.combat || 'none', level: value.level, xp: value.xp,
    skillPoints: value.skillPoints, activeSkill: value.activeSkill, ...(m ? { mana: m } : {}),
    economy: economy(value.economy) };
}

const names: Record<string, string> = { none: '未选职业', knight: '骑士', mage: '法师', ranger: '游侠',
  cleric: '牧师', beastmaster: '驯兽师', engineer: '工程师' };
/** Ephemeral connection-local readings; never load old class/money/mana as current. */
export class NativeRpgState {
  private profile: { value: NativeRpgProfile; at: string; source: string } | null = null;
  private learning: { points: number; at: string } | null = null;
  private signature = '';
  reset(): void { this.profile = null; this.learning = null; this.signature = ''; }
  identity(): { available: boolean; classId?: string } | null {
    return this.profile ? { available: this.profile.value.available, classId: this.profile.value.classId } : null;
  }
  chat(text: string, at = new Date().toISOString()): boolean {
    const value = nativeRpgMessage(text); if (!value) return false;
    const profile = readNativeRpgStatus(value);
    if (profile) return this.update(profile, at, 'MC_RPG status');
    const skills = readNativeSkills(value, at);
    if (skills) { const changed = this.learning?.points !== skills.skillPoints; this.learning = { points: skills.skillPoints, at }; return changed; }
    return false;
  }
  packet(channel: unknown, data: unknown, at = new Date().toISOString()): boolean {
    const profile = readNativeRpgPacket(channel, data); return profile ? this.update(profile, at, 'mcagent:state.profession') : false;
  }
  private update(value: NativeRpgProfile, at: string, source: string): boolean {
    const prior = this.profile?.value;
    if (!value.available || prior?.classId !== value.classId) this.learning = null;
    if (value.skillPoints !== undefined) this.learning = { points: value.skillPoints, at };
    // Queries omit activeSkill/skillPoints. Preserve their latest same-class observation,
    // but not their old mana or balance. An explicit unavailable profile clears everything.
    if (value.available && prior?.available && prior.classId === value.classId) {
      value = { ...value, ...(value.skillPoints === undefined && prior.skillPoints !== undefined ? { skillPoints: prior.skillPoints } : {}),
        ...(value.activeSkill === undefined && prior.activeSkill !== undefined ? { activeSkill: prior.activeSkill } : {}) };
    }
    this.profile = { value, at, source };
    const signature = JSON.stringify([value.available, value.classId, value.level, value.skillPoints, value.activeSkill, value.economy, value.preview]);
    const changed = signature !== this.signature; this.signature = signature; return changed;
  }
  brief(): string {
    const observation = this.profile; if (!observation) return '';
    const p = observation.value, head = `[原生 RPG 最近观测] ${observation.source} ${observation.at}；`;
    if (!p.available) return head + '职业后端未就绪，职业、经验、余额和魔力未知；不沿用旧值。';
    const fields = [`职业 ${names[p.classId!] ?? p.classId}`, `RPG战斗等级 ${p.level}，经验 ${p.xp}`];
    if (p.nextLevelXp !== undefined) fields.push(`距下级 ${p.nextLevelXp}`);
    const skillPoints = this.learning?.points ?? p.skillPoints;
    if (skillPoints !== undefined) fields.push(`学习点 ${skillPoints}`);
    if (p.activeSkill !== undefined) fields.push(`当前准备技能 ${p.activeSkill || '未准备'}`);
    fields.push(p.mana ? `魔力 ${p.mana.current}/${p.mana.max}` : '魔力未知');
    fields.push(p.economy?.available && p.economy.balance !== null ? `服务端余额 ${p.economy.balance}` : '经济未就绪或余额未知');
    if (p.preview) fields.push('服务端标记预览');
    return head + fields.join('；') + '。RPG等级与原版经验等级分别记录；技能资格查 mc_query {"query":"skills.status"}，完整状态查 mc_query {"query":"status"}。';
  }
}
