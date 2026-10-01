import { describe, expect, it } from 'vitest';
import { routeViaServerCommand } from '../src/world.ts';

describe('千灯纪服务端快捷抵达', () => {
  it('远程去试炼场入口先使用已验证命令，随后仍核验目标坐标', () => {
    const target = { skill: 'goto', at: [-594, 91, -313], dimension: 'minecraft:overworld' };
    const result = routeViaServerCommand({ steps: [target] });
    expect(result.args.steps).toEqual([
      { skill: 'server_travel', command: '/mycli goto arena', at: [-590, 91, -322], within: 3 },
      { ...target, needs: [1] },
    ]);
    expect(result.note).toContain('/mycli goto arena');
  });

  it('已有同一命令不重复插入；普通路线保持原样', () => {
    const at = { skill: 'goto', at: [-594, 91, -313] };
    const steps = [{ skill: 'chat', text: '/mycli goto arena' }, at];
    expect(routeViaServerCommand({ steps }).args.steps).toEqual([
      { skill: 'server_travel', command: '/mycli goto arena', at: [-590, 91, -322], within: 3 },
      { ...at, needs: [1] },
    ]);
    const other = [{ skill: 'goto', at: [-500, 70, -400] }];
    expect(routeViaServerCommand({ steps: other }).args.steps).toEqual(other);
  });

  it('插入传送步骤后重映射显式依赖，失败时不执行后续到达', () => {
    const steps = [
      { skill: 'look', yaw: 0 },
      { skill: 'goto', at: [-594, 91, -313], needs: [1] },
      { skill: 'chat', text: '抵达', needs: [2] },
    ];
    const result = routeViaServerCommand({ steps }).args.steps as Array<{ skill: string; needs?: number[] }>;
    expect(result[1].skill).toBe('server_travel');
    expect(result[1].needs).toEqual([1]);
    expect(result[2].needs).toEqual([1, 2]);
    expect(result[3].needs).toEqual([3]);
  });

  it('入口落点坐标与 overworld 别名也走快捷传送', () => {
    const target = { skill: 'goto', at: [-590, 91, -322], dimension: 'overworld' };
    expect(routeViaServerCommand({ steps: [target] }).args.steps).toEqual([
      { skill: 'server_travel', command: '/mycli goto arena', at: [-590, 91, -322], within: 3 },
      { ...target, needs: [1] },
    ]);
  });
});
