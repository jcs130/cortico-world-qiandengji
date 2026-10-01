import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface CatalogFile {
  version: 1;
  server: string;
  updatedAt: string;
  entries: Record<string, string>;
}

/** The server's own skill listings, kept as observations rather than inferred abilities. */
export class SkillCatalog {
  private readonly file: string | null;
  private readonly server: string;
  private readonly entries = new Map<string, string>();
  private updatedAt = '';
  private readonly hadPreviousCatalog: boolean;
  private firstObservationAtMs: number | null = null;

  constructor(server: string, dataDir?: string) {
    this.server = server;
    this.file = dataDir ? join(dataDir, 'mymc-skills.json') : null;
    if (this.file && existsSync(this.file)) {
      try {
        const saved = JSON.parse(readFileSync(this.file, 'utf8')) as CatalogFile;
        if (saved.version === 1 && saved.server === server && saved.entries
          && typeof saved.entries === 'object') {
          for (const [heading, line] of Object.entries(saved.entries)) {
            if (typeof line === 'string') this.entries.set(heading, line);
          }
          this.updatedAt = saved.updatedAt;
        }
      } catch { /* A damaged observation ledger is replaced by the next server listing. */ }
    }
    this.hadPreviousCatalog = this.entries.size > 0;
  }

  observe(text: string, at: string): string | null {
    const line = /^\[MC (?:系统|插件)\] (.+)$/.exec(text)?.[1]?.trim();
    if (!line) return null;
    const heading = /^([^：:]{2,30})[：:]/.exec(line)?.[1]?.trim();
    if (!heading || !/(?:技能|咏唱|法术|可学习|探矿|魔力)/.test(heading)) return null;
    if (this.entries.get(heading) === line) return null;
    const atMs = Date.parse(at) || Date.now();
    this.firstObservationAtMs ??= atMs;
    const existed = this.entries.has(heading);
    this.entries.set(heading, line);
    this.updatedAt = at;
    this.save();
    // 初次登录会连发整份目录；把这段当基线，之后出现的新标题也要通知。
    return this.hadPreviousCatalog || existed || atMs - this.firstObservationAtMs >= 30_000
      ? heading : null;
  }

  readout(): string {
    if (this.entries.size === 0) {
      return '[千灯纪技能] 尚未收到服务端技能目录。可在游戏聊天发送 /mycli goddess skills 或 /mycli help，再按回执判断。';
    }
    return `[千灯纪技能] 服务端 ${this.server}，最近观测 ${this.updatedAt}。目录是当时的服务端原话；学习状态与消耗可能改变，执行前按新回执核对。\n`
      + [...this.entries.values()].join('\n');
  }

  private save(): void {
    if (!this.file) return;
    try {
      writeFileSync(this.file, JSON.stringify({
        version: 1, server: this.server, updatedAt: this.updatedAt,
        entries: Object.fromEntries(this.entries),
      } satisfies CatalogFile), 'utf8');
    } catch { /* The live observation remains available until this World stops. */ }
  }
}
