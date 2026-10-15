import { createViewerAppearanceBridge } from './viewer-appearance.mjs';
import { createViewerObserverBridge } from './viewer-observer.mjs';
import { viewerCastCommand, viewerCastResult } from './viewer-cast.ts';
import type { ViewerSkills } from 'agent-mc-world/extension';
import type { ViewerServerProtocol } from 'agent-mc-world/extension';
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const bounded = (value: unknown, min: number, max: number): number | null => finite(value) ? Math.max(min,Math.min(max,value)) : null;
export const VIEWER_STATE_CHANNEL = 'mcagent:state';
export function manaSnapshotFromText(text: unknown): { current: number; max: number } | null {
  if (typeof text !== 'string' || text.length > 512) return null;
  const label = /(?:魔力|法力|\b(?:mana|mp)\b)/iu.exec(text);
  if (!label) return null;
  const part = text.slice(label.index + label[0].length, label.index + label[0].length + 60);
  const pair = /(?:当前|current)?[^\d\n]{0,24}(\d{1,6})\s*\/\s*(\d{1,6})/iu.exec(part);
  if (!pair) return null;
  const current = Number(pair[1]);
  const max = Number(pair[2]);
  return max > 0 && current <= max ? { current, max } : null;
}
export function spellCatalogueFromText(text: unknown): ViewerSkills['abilities'] | null {
  if (typeof text !== 'string' || text.length > 16_384 ||
      !/(?:战斗咏唱|探索咏唱)[：:]/u.test(text)) return null;
  const abilities: ViewerSkills['abilities'] = [];
  for (const match of text.matchAll(/([^、，；：:()（）\s]{1,32})[（(]([a-z][a-z0-9_:-]{0,63})[，,]([^）)]{0,160})[）)]/giu)) {
    const id = match[2].toLowerCase();
    const cost = /(\d{1,4})\s*魔力/u.exec(match[3]);
    const cooldown = /(?:\/|冷却\s*)(\d{1,5})\s*秒/u.exec(match[3]);
    abilities.push({ id, name: match[1], level: null,
      cooldownMs: cooldown ? Number(cooldown[1]) * 1_000 : null,
      manaCost: cost ? Number(cost[1]) : null });
  }
  return abilities.length ? abilities : null;
}
export function parseSkillsPayload(channel: unknown, data: unknown): ViewerSkills | null {
  if ((channel !== VIEWER_STATE_CHANNEL && channel !== 'mcviewer:state' && channel !== 'corti:viewer_state') ||
      !Buffer.isBuffer(data) || data.length > 65_536) return null;
  let raw: unknown;
  try { raw = JSON.parse(data.toString('utf8')); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  if (channel === VIEWER_STATE_CHANNEL) {
    if (input.schemaVersion !== 1 || !Object.hasOwn(input, 'mana')) return null;
    if (input.mana !== null) {
      if (!input.mana || typeof input.mana !== 'object' || Array.isArray(input.mana)) return null;
      const mana = input.mana as Record<string, unknown>;
      const current = bounded(mana.current, 0, 1_000_000);
      const max = bounded(mana.max, 0, 1_000_000);
      if (current === null || max === null || max <= 0 || current > max) return null;
    }
  }
  if (input.schemaVersion !== 1 || !('mana' in input || 'skills' in input || 'abilities' in input) ||
      (input.skills !== undefined && !Array.isArray(input.skills)) ||
      (input.abilities !== undefined && !Array.isArray(input.abilities))) return null;
  const mana = input.mana as Record<string, unknown> | null | undefined;
  const current = bounded(mana?.current, 0, 1_000_000);
  const max = bounded(mana?.max, 0, 1_000_000);
  const readName = (value: unknown, maxLength: number) => typeof value === 'string' && value.length <= maxLength ? value : null;
  const skillsInput = Array.isArray(input.skills) ? input.skills : [];
  const skills = skillsInput.map((value: unknown) => {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    const id = readName(row.id, 64);
    const name = readName(row.name, 80);
    const level = bounded(row.level, 0, 100_000);
    if (!id || !/^[a-z0-9_:.-]+$/.test(id) || !name || level === null) return null;
    return { id, name, level, xp: bounded(row.xp, 0, 1_000_000_000),
      requiredXp: bounded(row.requiredXp, 0, 1_000_000_000) };
  });
  if (skills.some((entry) => !entry)) return null;
  const abilitiesInput = Array.isArray(input.abilities) ? input.abilities : [];
  const abilities = abilitiesInput.map((value) => {
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    const id = readName(row.id, 64);
    const name = readName(row.name, 80);
    if (!id || !/^[a-z0-9_:.-]+$/.test(id) || !name) return null;
    const icon = readName(row.icon, 64);
    const cooldownMs = bounded(row.cooldownMs, 0, 86_400_000);
    return { id, name, level: bounded(row.level, 0, 100_000),
      cooldownMs: channel === 'mcviewer:state' ? null : cooldownMs,
      ...(channel === 'mcviewer:state'
        ? { cooldownRemainingMs: cooldownMs }
        : row.cooldownRemainingMs !== undefined
          ? { cooldownRemainingMs: bounded(row.cooldownRemainingMs, 0, 86_400_000) } : {}),
      manaCost: bounded(row.manaCost, 0, 1_000_000),
      ...(icon && /^(?:minecraft:)?[a-z0-9_]+$/.test(icon)
        ? { icon: icon.replace(/^minecraft:/, '') } : {}) };
  });
  if (abilities.some((entry) => !entry)) return null;
  return { schemaVersion: 1, mana: current !== null && max !== null && max > 0 && current <= max ? { current, max } : null,
    skills: skills as ViewerSkills['skills'], abilities: abilities as ViewerSkills['abilities'] };
}
function matchingAbility(abilities: ViewerSkills['abilities'], id: string) {
  const exact = abilities.find((entry) => entry.id === id);
  if (exact) return exact;
  const suffix = id.split(':').at(-1);
  const matches = abilities.filter((entry) => entry.id.split(':').at(-1) === suffix);
  return matches.length === 1 ? matches[0] : undefined;
}
export function mergeViewerSkillState(previous: ViewerSkills | null, next: ViewerSkills,
  channel: string, agentStateSeen: boolean): ViewerSkills {
  const authoritative = channel === VIEWER_STATE_CHANNEL;
  const oldAbilities = previous?.abilities ?? [];
  const abilities = authoritative
    ? next.abilities.map((ability) => ({ ...ability,
      manaCost: ability.manaCost ?? matchingAbility(oldAbilities, ability.id)?.manaCost ?? null }))
    : agentStateSeen ? oldAbilities : next.abilities.length ? next.abilities : oldAbilities;
  return { ...next,
    mana: authoritative || !agentStateSeen ? next.mana : previous?.mana ?? null,
    skills: next.skills.length ? next.skills : previous?.skills ?? [],
    abilities, source: 'plugin', observedAt: Date.now() };
}
export function mergeViewerSpellCatalogue(previous: ViewerSkills | null,
  catalogue: ViewerSkills['abilities'], agentStateSeen: boolean): ViewerSkills {
  const oldAbilities = previous?.abilities ?? [];
  const abilities = agentStateSeen
    ? oldAbilities.map((ability) => ({ ...ability,
      manaCost: ability.manaCost ?? matchingAbility(catalogue, ability.id)?.manaCost ?? null }))
    : (() => {
      const merged = new Map(oldAbilities.map((ability) => [ability.id, ability]));
      for (const entry of catalogue) {
        const old = matchingAbility(oldAbilities, entry.id);
        merged.set(old?.id ?? entry.id, old ? { ...entry, ...old,
          cooldownMs: old.cooldownMs ?? entry.cooldownMs,
          manaCost: old.manaCost ?? entry.manaCost } : entry);
      }
      return [...merged.values()];
    })();
  return { ...(previous ?? { schemaVersion: 1, mana: null, skills: [] }),
    abilities, observedAt: Date.now() };
}
import type { ViewerCustomEvent } from 'agent-mc-world/extension';
export const VIEWER_EVENT_CHANNEL = 'mcagent:event';
export function parseViewerCustomEvent(channel: unknown, data: unknown): ViewerCustomEvent | null {
  if ((channel !== VIEWER_EVENT_CHANNEL && channel !== 'mcviewer:event') ||
      !Buffer.isBuffer(data) || data.length > 16_384) return null;
  let raw: unknown;
  try { raw = JSON.parse(data.toString('utf8')); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const kinds = new Set(['skill', 'quest', 'notice', 'combat', 'environment', 'achievement']);
  const tones = new Set(['positive', 'neutral', 'warning', 'danger', 'arcane', 'healing', 'frost', 'fire', 'movement']);
  if (row.schemaVersion !== 1 || !kinds.has(String(row.kind)) ||
      typeof row.id !== 'string' || !/^[a-z0-9_:.-]{1,80}$/.test(row.id) ||
      typeof row.title !== 'string' || row.title.length < 1 || row.title.length > 80 ||
      typeof row.body !== 'string' || row.body.length > 240) return null;
  const sourcePosition = row.position as Record<string, unknown> | null;
  const position = sourcePosition && point(sourcePosition.x, sourcePosition.y, sourcePosition.z);
  if (sourcePosition && !position) return null;
  return { kind: row.kind as ViewerCustomEvent['kind'], id: row.id, title: row.title,
    body: row.body, tone: tones.has(String(row.tone)) ? row.tone as ViewerCustomEvent['tone'] : 'arcane',
    ...(position ? { position } : {}) };
}
export const serverViewerProtocol: ViewerServerProtocol = { createAppearance: createViewerAppearanceBridge, createObserver: createViewerObserverBridge, castCommand:viewerCastCommand,castResult:viewerCastResult,stateChannel: VIEWER_STATE_CHANNEL, parseSkillsPayload, manaSnapshotFromText, spellCatalogueFromText, mergeViewerSkillState, mergeViewerSpellCatalogue, parseViewerCustomEvent };

const point = (x:unknown,y:unknown,z:unknown) => finite(x) && finite(y) && finite(z) ? {x,y,z} : null;
