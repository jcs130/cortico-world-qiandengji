import type { MinecraftBot as Bot } from 'agent-mc-world/extension';
import { CombatAbilities, type CombatSpell, type CombatTactic } from 'agent-mc-world/tactics';
export type { CombatSpell, CombatTactic } from 'agent-mc-world/tactics';
import { manaSnapshotFromText } from './viewer-state.ts';
import { viewerCastResult } from './viewer-cast.ts';
const SPELLS: ReadonlyArray<CombatSpell> = ['golem', 'frostnova', 'flamewave', 'starbolt'];
const SPELL_COOLDOWN_MS: Readonly<Record<string, number>> = {
  golem: 75_000,
  frostnova: 15_000,
  flamewave: 15_000,
  starbolt: 6_000,
};
const DEFAULT_COST: Readonly<Record<string, number>> = {
  golem: 12, frostnova: 7, flamewave: 8, starbolt: 4,
};
const GLOBAL_GAP_MS = 1_500;
const CHECK_GAP_MS = 250;
const RANGED = new Set(['skeleton', 'stray', 'bogged', 'pillager', 'witch', 'blaze', 'ghast', 'illusioner', 'breeze']);

/** Qiandengji spell catalogue, reply parser and explicit server fallback profile. */
export class CombatSpells extends CombatAbilities {
  protected override get defaultSpells() { return SPELLS; }
  protected override get defaultCosts() { return DEFAULT_COST; }
  protected override get defaultCooldowns() { return SPELL_COOLDOWN_MS; }
  protected override get supportSpell() { return 'selfheal'; }
  protected override cooldownOf(spell: string) { return this.cooldowns.get(spell) ?? SPELL_COOLDOWN_MS[spell] ?? 15_000; }
  override noteAbilities(abilities: Parameters<CombatAbilities['noteAbilities']>[0], now = Date.now()): void {
    super.noteAbilities(abilities.map(a => ({...a, id:a.id.split(':').at(-1)!})), now);
  }
  noteServerMessage(text: string, now = Date.now()): void {
    const attempt = this.casts.at(-1);
    if (attempt && now - Date.parse(attempt.sentAt) >= 0
      && now - Date.parse(attempt.sentAt) <= 3_000 && !attempt.reply
      && viewerCastResult(text, attempt.spell)) {
      attempt.reply = text.slice(0, 240);
      attempt.replyAt = new Date(now).toISOString();
    }
    const reportedMana = manaSnapshotFromText(text);
    if (reportedMana) this.noteMana(reportedMana.current, now);
    if (/^(?:战斗咏唱|探索咏唱)[：:]/.test(text)) {
      for (const match of text.matchAll(/[（(]([a-z][a-z0-9_:-]*)[，,]([^）)]*)[）)]/gi)) {
        const spell = match[1].toLowerCase();
        if (!this.available.has(spell)) {
          this.available.add(spell);
          this.lastCheck = Number.NEGATIVE_INFINITY;
        }
        const cost = /(\d+)\s*魔力/.exec(match[2]);
        if (cost) this.costs.set(spell, Number(cost[1]));
        const cooldown = /(\d+)\s*秒/.exec(match[2]);
        if (cooldown) this.cooldowns.set(spell, Number(cooldown[1]) * 1_000);
      }
    }
    if (/魔力不足|灵力不足|not enough (?:mana|magic)|insufficient (?:mana|magic)/i.test(text)) {
      if (this.pending && now - this.pending.at <= 3_000) {
        const required = /需要\s*(\d+)/.exec(text);
        if (required) this.costs.set(this.pending.spell, Number(required[1]));
        if (reportedMana) {
          this.manaRetryAt.set(this.pending.spell,
            Math.max(reportedMana.current + 1, Number(required?.[1] ?? 0)));
        }
      }
      this.manaBlockedUntil = now + (reportedMana ? GLOBAL_GAP_MS : 15_000);
      this.pending = null;
    } else if (this.pending && now - this.pending.at <= 3_000
      && /冷却中|cooldown|无法施放|施法失败|cannot cast|failed to cast/i.test(text)) {
      this.pending = null;
    }
  }

  protected override selectFallback(_bot: Bot, foes: Bot['entity'][], ready: (spell: string) => boolean, near: (radius: number) => number): string | null {
    const planned = this.tactic?.spells ?? null;
    for (const spell of planned ?? SPELLS) {
      if (!ready(spell)) continue;
      if (spell === 'golem' && foes.length >= (planned ? 1 : 3)) return spell;
      if (spell === 'frostnova' && near(7) >= (planned ? 1 : 2)) return spell;
      if (spell === 'flamewave' && near(8) >= (planned ? 1 : 2)) return spell;
      if (spell === 'starbolt' && (planned ? near(12) >= 1
        : foes.some((e) => RANGED.has(e.name ?? '')))) return spell;
      if (planned && !SPELLS.includes(spell) && near(12) >= 1) return spell;
    }
    return null;
  }
}
