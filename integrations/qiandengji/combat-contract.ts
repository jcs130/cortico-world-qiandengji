/** Surface the engine's current spell constraints before the detailed receipt. */
export function combatTacticNote(text: string): string | null {
  const line = text.split(/\r?\n/).find(value => value.startsWith('{') && value.includes('"checks":'));
  if (!line) return null;
  let value: { checks?: Array<{ spell: string; selected: boolean; block: string | null }> };
  try { value = JSON.parse(line); } catch { return null; }
  const selected = value.checks?.filter(check => check.selected) ?? [];
  const blocked = selected.filter(check => check.block);
  if (!blocked.length) return null;
  return `[战术执行条件] 已选 ${selected.length} 项，当前 ${blocked.length} 项受阻：`
    + blocked.map(check => `${check.spell}（${check.block}）`).join('、')
    + '。设置已保存不代表这些法术已可施放；主动进攻仍需提交 attack，能力与效果按服务端回执核对。';
}
