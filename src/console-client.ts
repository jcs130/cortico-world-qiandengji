import type { ConsoleClientBundle } from 'cortico/web/shared/client-panel.ts';
import minecraftBundle from '../engine/console/client.ts';

const bundle: ConsoleClientBundle = {
  panels: {
    mount: minecraftBundle.panels.mount,
    skin: minecraftBundle.panels.skin,
    log: minecraftBundle.panels.log,
  },
};

export default bundle;
