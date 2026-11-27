import { MinecraftClientWorld, MINECRAFT_CLIENT_DEFAULTS, MINECRAFT_TOOL_DECLS,
  namespaceWorldHost, namespaceWorldStorage, mapWorldOutcomeNamespace,
  type MinecraftWorldOptions } from 'agent-mc-world/extension';
import type { ToolDef, WorldHost } from 'agent-mc-world/contracts';

export { MINECRAFT_CLIENT_DEFAULTS };
export const LITE_ID = 'mymc-lite';
export const CORE_TOOL_NAMES = ['do','scout','policy','goal','map','blueprint','check','view_map','bag','queue','blocked','stop','escape'] as const;
export const LITE_TOOL_NAMES = [...CORE_TOOL_NAMES.map(name => 'mymc_' + name), 'mymc_server_info'];
const allowed = new Set(CORE_TOOL_NAMES.map(name => 'mc_' + name));
const toolText = (text: string) => text.replace(/\bmc_([a-z][a-z0-9_]*)\b/g, 'mymc_$1');
// Only documentation is renamed: required, enum, const, defaults and examples are data.
function schemaText(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(schemaText);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    ['enum','const','default','examples','required'].includes(key) ? item
      : ['description','title'].includes(key) && typeof item === 'string' ? toolText(item) : schemaText(item)]));
}
function declaration<T extends {name:string;description:string;parameters:Record<string,unknown>}>(tool:T):T {
  return {...tool, name:tool.name.replace(/^mc_/, 'mymc_'), description:toolText(tool.description),
    parameters:schemaText(tool.parameters) as Record<string,unknown>};
}
export function liteToolDeclarations() {
  return CORE_TOOL_NAMES.map(name => {
    const tool = MINECRAFT_TOOL_DECLS.find(tool => tool.name === 'mc_' + name);
    if (!tool) throw Error('Shared World tool unavailable: mc_' + name);
    return declaration(tool);
  });
}

/** Naming and allowlist only; execution, queues and terminal receipts belong to the shared World. */
export class SharedLiteWorld extends MinecraftClientWorld {
  override readonly id = LITE_ID;
  override tools():ToolDef[] {
    const tools = super.tools().filter(tool => allowed.has(tool.name));
    if (tools.length !== CORE_TOOL_NAMES.length || new Set(tools.map(tool => tool.name)).size !== tools.length)
      throw Error('Shared World Lite tool allowlist mismatch');
    return CORE_TOOL_NAMES.map(name => {
      const tool = tools.find(tool => tool.name === 'mc_' + name)!;
      return {...declaration(tool), handler:async (args, context) =>
        mapWorldOutcomeNamespace(await tool.handler(args, context), 'minecraft', this.id)};
    });
  }
  override console() {
    const base = super.console();
    return {...base, storage:namespaceWorldStorage(base.storage, 'minecraft', this.id),
      config:base.config?.map(group => ({...group,
        id:group.id.replace(/^world:minecraft(?=$|[.:])/, 'world:' + this.id),
        owner:('world:' + this.id) as `world:${string}`,
        schema:{...group.schema, properties:Object.fromEntries(Object.entries(group.schema.properties).map(([key,value]) =>
          [key.replace(/^worlds\.minecraft\./, 'worlds.' + this.id + '.'), value]))},
      })),
      promptDocs:base.promptDocs?.map(doc => ({...doc, key:'worlds.' + this.id + '.envPrompt'}))};
  }
  override start(host:WorldHost) { return super.start(namespaceWorldHost(host, 'minecraft', this.id)); }
}
export type LiteConfig = typeof MINECRAFT_CLIENT_DEFAULTS & {serverMode:'external';loginConfirmation:'mc-auth-success';loginConfigFile:string};
export type SharedOptions = MinecraftWorldOptions;
