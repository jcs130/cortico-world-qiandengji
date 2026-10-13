/** Qiandengji portable storage rules, using the actual item's server-supplied name. */
import type { MinecraftBot as Bot } from 'agent-mc-world/extension';
import { Vec3 } from 'vec3';
import { itemCustomName, zhName, invCount, itemPredOf, invItemNamed, resolveAt, CONTAINER_FIND, type SkillCall } from 'agent-mc-world/extension';

export function portableStorageMisuseNote(bot: Bot | null, steps: readonly SkillCall[]): string | null {
    if (!bot?.inventory?.items) return null;
    const portable = bot.inventory.items().find((item) => item.name === 'player_head'
      && /背包|backpack|rucksack|satchel/i.test((itemCustomName(item) ?? '').replace(/§./g, '')));
    if (!portable) return null;
    const name = itemCustomName(portable) ?? zhName(portable.name);
    const opener = steps[0];
    if (opener?.skill === 'use' && opener.item && !opener.at
      && invItemNamed(bot, opener.item) === portable) {
      for (const step of steps.slice(1)) {
        if (step.skill !== 'stow' || step.into !== 'open') continue;
        const held = invCount(bot, itemPredOf(bot, step.item, step.pick));
        if (held < step.count) {
          return `${name}窗口里的物品还不在随身栏；stow 是把随身物品放进窗口，包里只有${zhName(step.item)}×${held}，本单却要存×${step.count}。想清空随身容器，请在同一单用 use item + take from:"open"，再另起一单存进地面箱；原队列保留`;
        }
      }
    }
    for (const step of steps) {
      if (step.skill === 'stow' && itemPredOf(bot, step.item, step.pick)(portable.name, portable)) {
        return `${name}是随身容器，不要把它当普通玩家头存入箱子。要整理内容，先在同一单执行 use item:${portable.name} + take from:"open"，把物品取到随身栏；再另起一单 stow 到地面箱。窗口在每单结束时自动关闭；原队列保留`;
      }
      if (step.skill === 'use' && step.item && invItemNamed(bot, step.item) === portable && step.at) {
        try {
          const target = resolveAt(bot, step.at);
          const block = bot.blockAt?.(new Vec3(target.x, target.y, target.z));
          if (block && CONTAINER_FIND.includes(block.name)) {
            return `${name}点地面箱只会打开那个箱子，不会整理随身容器。打开地面箱用 use at；打开随身容器用 use item 且不带 at；原队列保留`;
          }
        } catch { /* 坐标未加载时交给执行期校验 */ }
      }
    }
    return null;
}
