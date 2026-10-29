/** Read-only protocol projections from the published Paper/Vortex bridge.
 * Source: minecraft-ai-friend/paper, native RPG release 420d6d32.
 * MC_RPG has several distinct response shapes; it is not a spell list envelope.
 */
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => number(value) && value >= 0;
const points = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9_:-]{0,63}$/i.test(value);

export interface NativeSkillNode {
  id: string; requiredLevel: number; cost: number; displayName?: string; grantedSpellId?: string;
  description?: string; permanentBonuses?: Record<string, number>;
}
export interface NativeSkills {
  observedAt: string; available: string[]; common: string[]; learnable: string[]; skillPoints: number;
  nodes?: NativeSkillNode[]; activeSpell?: string;
}
export function readNativeSkills(value: unknown, at: string, saved = false): NativeSkills | null {
  if (!object(value) || !Number.isFinite(Date.parse(at))) return null;
  const ids = (values: unknown): string[] | null => Array.isArray(values) && values.length <= 256 && values.every(id)
    ? [...new Set(values as string[])] : null;
  const available = ids(value.available), common = ids(value.common);
  const learnable = ids(saved ? value.learnable : Array.isArray(value.learnable)
    ? value.learnable.map(v => object(v) ? v.id : null) : null);
  if (!available || !common || !learnable || !points(value.skillPoints)) return null;
  const node = (v: unknown): NativeSkillNode | null => {
    if (!object(v) || !id(v.id) || !points(v.requiredLevel) || !points(v.cost)) return null;
    const bonuses = object(v.permanentBonuses) && Object.keys(v.permanentBonuses).length <= 16
      && Object.entries(v.permanentBonuses).every(([key,value])=>id(key) && number(value) && Math.abs(value)<=1_000_000)
      ? {...v.permanentBonuses} as Record<string,number> : undefined;
    return { id: v.id, requiredLevel: v.requiredLevel, cost: v.cost,
      ...(typeof v.displayName === 'string' && v.displayName.length <= 80 && !/[\u0000-\u001f\u007f]/.test(v.displayName)
        ? { displayName: v.displayName } : {}),
      ...(typeof v.description === 'string' && v.description.length <= 512 && !/[\u0000-\u001f\u007f]/.test(v.description)
        ? {description:v.description} : {}),
      ...(bonuses ? {permanentBonuses:bonuses} : {}),
      ...(id(v.grantedSpellId) ? { grantedSpellId: v.grantedSpellId } : {}) };
  };
  const rawNodes = saved ? value.nodes : value.learnable;
  const parsed = (Array.isArray(rawNodes) ? rawNodes : []).map(node).filter((v): v is NativeSkillNode => v !== null);
  return { observedAt: at, available, common, learnable, skillPoints: value.skillPoints,
    ...(parsed.length ? { nodes: parsed } : {}),
    ...(value.activeSpell === '' || id(value.activeSpell) ? { activeSpell: value.activeSpell } : {}) };
}

export function nativeRpgMessage(text: string): Record<string, unknown> | null {
  if (text.length > 65_536 || !text.startsWith('MC_RPG ') || /[\r\n]/.test(text)) return null;
  try { const value = JSON.parse(text.slice(7)); return object(value) ? value : null; } catch { return null; }
}

export interface NativeSkillDetail {
  id: string; name: string; command: string; observedAt: string;
  source: 'MC_RPG'; invocation: 'cast' | 'command';
  mana: number | null; cooldownMs: number | null; cooldownRemainingMs: number | null;
  effect: string | null; requires: string | null; available: boolean | null;
}
/** A skill ID is not necessarily a /cast subcommand. Read the advertised route. */
export function readNativeSkillDetail(value: unknown, at: string): NativeSkillDetail | null {
  const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max
    && !/[\u0000-\u001f\u007f-\u009f\u00a7]/.test(v);
  if (!object(value) || value.schemaVersion !== 1 || !id(value.id) || !text(value.name, 80)
    || !text(value.command, 256) || !value.command.startsWith('/mycli ') || !Number.isFinite(Date.parse(at))) return null;
  const cast = `/mycli cast ${value.id}`;
  return { id: value.id, name: value.name, command: value.command, observedAt: at, source: 'MC_RPG',
    invocation: value.command === cast || value.command.startsWith(cast + ' ') ? 'cast' : 'command',
    mana: nonnegative(value.mana) ? value.mana : null, cooldownMs: nonnegative(value.cooldownMs) ? value.cooldownMs : null,
    cooldownRemainingMs: nonnegative(value.cooldownRemainingMs) ? value.cooldownRemainingMs : null,
    effect: text(value.effect, 1024) ? value.effect : null, requires: text(value.requires, 1024) ? value.requires : null,
    available: typeof value.available === 'boolean' ? value.available : null };
}
export function readNativeSkillInvocations(value: unknown, at: string): NativeSkillDetail[] | null {
  if(!object(value)||value.schemaVersion!==1||value.kind!=='skill_invocations'||value.queryOnly!==true
    ||!Array.isArray(value.entries)||value.entries.length>64)return null;
  const entries=value.entries.map(e=>readNativeSkillDetail(e,at));
  return entries.every((e):e is NativeSkillDetail=>e!==null)&&new Set(entries.map(e=>e.id)).size===entries.length?entries:null;
}

export interface NativeRpgProfile {
  available: boolean; classId?: string; level?: number; xp?: number; nextLevelXp?: number;
  mana?: { current: number; max: number }; skillPoints?: number; activeSkill?: string;
  economy?: { available: boolean; balance: number | null }; preview?: boolean;
  guidance?: NativeRpgGuidance;
  /** Current Vortex spell IDs from profession.abilities, not learnable/passive nodes. */
  skillIds?: string[];
}
/** A bounded server observation, never an instruction to execute or a local progression policy. */
export interface NativeRpgGuidance {
  step: string; reason: string; nextAction: string;
  nextCommand?: string; verifyCommand?: string;
  queryOnly: boolean | null; requiresWorldAction: boolean | null; missing: string[] | null;
}
function guidance(value: unknown): NativeRpgGuidance | undefined {
  if (!object(value)) return undefined;
  const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0
    && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
  if (!id(value.step) || !id(value.reason) || !text(value.nextAction, 512)) return undefined;
  const command = (v: unknown) => text(v, 180) && v.startsWith('/mycli ') ? v : undefined;
  const missing = Array.isArray(value.missing) && value.missing.length <= 12
    && value.missing.every(v => text(v, 120)) ? [...value.missing] as string[] : null;
  return { step: value.step, reason: value.reason, nextAction: value.nextAction,
    ...(command(value.nextCommand) ? { nextCommand: command(value.nextCommand) } : {}),
    ...(command(value.verifyCommand) ? { verifyCommand: command(value.verifyCommand) } : {}),
    queryOnly: typeof value.queryOnly === 'boolean' ? value.queryOnly : null,
    requiresWorldAction: typeof value.requiresWorldAction === 'boolean' ? value.requiresWorldAction : null,
    missing };
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
  const next = guidance(value.guide);
  return { available: true, classId: value.class, level: value.level, xp: value.xp, nextLevelXp: value.nextLevelXp,
    mana: mana(value.mana, value.maxMana), economy: economy(value.economy), preview: value.preview,
    ...(next ? { guidance: next } : {}) };
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
  const skillIds = Array.isArray(value.abilities) && value.abilities.length <= 48
    && value.abilities.every(a => object(a) && id(a.id))
    ? [...new Set(value.abilities.map(a => String((a as Record<string, unknown>).id).replace(/^mycli:/, '')))] : undefined;
  return { available: true, classId: value.combat || 'none', level: value.level, xp: value.xp,
    skillPoints: value.skillPoints, activeSkill: value.activeSkill, ...(m ? { mana: m } : {}),
    economy: economy(value.economy), ...(skillIds ? { skillIds } : {}) };
}

const names: Record<string, string> = { none: '未选职业', knight: '骑士', mage: '法师', ranger: '游侠',
  cleric: '牧师', beastmaster: '驯兽师', engineer: '工程师' };
/** Ephemeral connection-local readings; never load old class/money/mana as current. */
export class NativeRpgState {
  private profile: { value: NativeRpgProfile; at: string; source: string } | null = null;
  private learning: { points: number; at: string; skills?: NativeSkills } | null = null;
  private skills: NativeSkills | null = null;
  private abilitySnapshot: { ids: string[]; at: string } | null = null;
  private details = new Map<string, NativeSkillDetail>();
  private signature = '';
  reset(): void { this.profile = null; this.learning = null; this.skills = null; this.abilitySnapshot = null; this.details.clear(); this.signature = ''; }
  skillDetail(id: string): NativeSkillDetail | null { return this.details.get(id) ?? null; }
  identity(): { available: boolean; classId?: string } | null {
    return this.profile ? { available: this.profile.value.available, classId: this.profile.value.classId } : null;
  }
  private currentAbilities(): { ids: string[]; at: string; source: string } | null {
    if (this.abilitySnapshot && (!this.skills || Date.parse(this.abilitySnapshot.at) >= Date.parse(this.skills.observedAt)))
      return { ...this.abilitySnapshot, source: 'mcagent:state.profession' };
    return this.skills ? { ids: this.skills.available, at: this.skills.observedAt, source: 'MC_RPG' } : null;
  }
  chat(text: string, at = new Date().toISOString()): boolean {
    const value = nativeRpgMessage(text); if (!value) return false;
    const invocations=readNativeSkillInvocations(value,at);
    if(invocations){
      for(const detail of invocations){this.details.delete(detail.id);this.details.set(detail.id,detail);}
      while(this.details.size>64)this.details.delete(this.details.keys().next().value!);
      return true;
    }
    const profile = readNativeRpgStatus(value);
    if (profile) return this.update(profile, at, 'MC_RPG status');
    const skills = readNativeSkills(value, at);
    if (skills) {
      // A changed list matters even when the remaining points did not change.
      const changed = JSON.stringify(this.learning?.skills && { ...this.learning.skills, observedAt: '' })
        !== JSON.stringify({ ...skills, observedAt: '' });
      this.learning = { points: skills.skillPoints, at, skills };
      // A list without a bound native identity cannot certify this class's abilities.
      this.skills = this.profile?.value.available ? skills : null;
      return changed;
    }
    const detail = readNativeSkillDetail(value, at);
    if (detail) {
      const old = this.details.get(detail.id);
      this.details.delete(detail.id); this.details.set(detail.id, detail);
      while (this.details.size > 64) this.details.delete(this.details.keys().next().value!);
      return JSON.stringify(old && { ...old, observedAt: '' }) !== JSON.stringify({ ...detail, observedAt: '' });
    }
    return false;
  }
  packet(channel: unknown, data: unknown, at = new Date().toISOString()): boolean {
    const profile = readNativeRpgPacket(channel, data); return profile ? this.update(profile, at, 'mcagent:state.profession') : false;
  }
  private update(value: NativeRpgProfile, at: string, source: string): boolean {
    const prior = this.profile?.value;
    if (!value.available || prior?.classId !== value.classId) { this.learning = null; this.skills = null; this.abilitySnapshot = null; this.details.clear(); }
    if (value.skillIds) this.abilitySnapshot = { ids: value.skillIds, at };
    if (value.skillPoints !== undefined && this.learning?.points !== value.skillPoints)
      this.learning = { points: value.skillPoints, at };
    // Queries omit activeSkill/skillPoints. Preserve their latest same-class observation,
    // but not their old mana or balance. An explicit unavailable profile clears everything.
    if (value.available && prior?.available && prior.classId === value.classId) {
      value = { ...value, ...(value.skillPoints === undefined && prior.skillPoints !== undefined ? { skillPoints: prior.skillPoints } : {}),
        ...(value.activeSkill === undefined && prior.activeSkill !== undefined ? { activeSkill: prior.activeSkill } : {}) };
    }
    this.profile = { value, at, source };
    const signature = JSON.stringify([value.available, value.classId, value.level, value.skillPoints, value.activeSkill, value.economy, value.preview, value.guidance, value.skillIds]);
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
    const skills = this.learning?.skills;
    const options = skills?.nodes?.slice(0, 6).map(n => ({ id: n.id,
      ...(n.displayName ? { name: n.displayName } : {}), requiredLevel: n.requiredLevel, learningPointCost: n.cost,
      ...(n.grantedSpellId ? { grantsActiveSpell: n.grantedSpellId } : { kind: 'passive_attribute_node' }),
      levelAndPointsMet: p.level === undefined ? null : p.level >= n.requiredLevel && this.learning!.points >= n.cost }));
    const current = this.currentAbilities(), available = current?.ids;
    return head + fields.join('；') + '。RPG等级与原版经验等级分别记录；技能资格查 mc_query {"query":"skills.status"}，完整状态查 mc_query {"query":"status"}。'
      + (skills ? `\n职业技能最近观测 ${skills.observedAt}：`
        + `学习候选 ${JSON.stringify(options ?? skills.learnable.slice(0, 6))}`
        + (skills.learnable.length > 6 ? `；另有 ${skills.learnable.length - 6} 项未展开` : '')
        + '。这是服务器清单；等级和学习点满足不代表已学习，详情与其他条件按 skills.info 回执核对。' : '')
      + (available ? '\n[职业技能现读] ' + current!.source + ' ' + current!.at + '；职业可用：'
        + (available.slice(0, 12).join('、') || '无') + (available.length > 12 ? `（共${available.length}项，摘要省略其余）` : '')
        + (this.skills ? '；完整清单的原观察时间读 mc_skills' : '；通用/可学习清单尚未读取')
        + '。mc_skills 读完整列表；mc_query {"query":"skills.info","arguments":["技能ID"]} 查目标/效果/消耗。已学不等于已编排，mc_combat_tactic 可按当前条件组合；发送不等于生效。' : '')
      + ([...this.details.values()].some(d => d.invocation === 'command') ? '\n已查专用入口（不是 /mycli cast）：'
        + [...this.details.values()].filter(d => d.invocation === 'command').slice(-4).map(d => `${d.id} → ${d.command}（${d.observedAt}）`).join('；') : '')
      + (p.guidance ? '\n服务端建议数据（沿用本次状态观察时间，未执行）：' + JSON.stringify(p.guidance) : '');
  }
  /** Connection-local, class-bound list; no disk history, command or learned conclusion. */
  hasCurrentSkills(): boolean { return !!this.profile?.value.available && !!(this.skills || this.abilitySnapshot); }
  skillsReadout(skillId?: string): string {
    const detail = skillId ? this.skillDetail(skillId) : null;
    if (detail) return '[本连接技能详情；按实际 command 选择工具，未执行]\n' + JSON.stringify(detail)
      + (detail.invocation === 'command' ? '\n这是专用命令入口，不是 mc_cast 技能。用 mc_do 的 chat 步骤发送明确的 command；不要把技能 ID 或原参数塞进 /mycli cast。' : '\nmc_cast 按此 ID 和服务端参数施法；发送不证明效果。');
    if ((!this.skills && !this.abilitySnapshot) || !this.profile?.value.available)
      return '当前职业技能列表未同步；用 mc_query {"query":"skills.status"} 读取本人当前列表，未返回历史能力。';
    const s = this.skills;
    const current = this.currentAbilities()!, available = current.ids;
    const category = !skillId ? null : available.includes(skillId) ? 'profession-available'
      : s?.common.includes(skillId) ? 'common-available' : s?.learnable.includes(skillId) ? 'learnable-in-last-list' : 'not-listed';
    return '[本人职业技能观察；可用与编排不同，未执行任何操作]\n' + JSON.stringify({ classId: this.profile.value.classId,
      available, availableObservedAt: current.at, source: current.source,
      lastSkillsList: s, ...(skillId ? { id: skillId, category } : {}), cost: null, cooldownRemainingMs: null, effectVerified: null })
      + '\n单项效果/目标/消耗用 mc_query {"query":"skills.info","arguments":["技能ID"]}；当前魔力/冷却和已选组合读 mc_combat_tactic。'
      + '先按单项 command 区分 mc_cast 施法和专用命令；被动节点无需施放。规则/程序可由 Agent 读说明后编排；未编排不自动施放，实际效果查服务端回执。';
  }
}
