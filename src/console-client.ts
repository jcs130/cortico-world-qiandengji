import type { ConsoleClientBundle } from 'cortico/web/shared/client-panel.ts';
import minecraftBundle from '../adapters/cortico/console/client.ts';
import { connectionPanel } from './connection-panel.ts';

const bundle: ConsoleClientBundle = {
  panels: {
    connection: connectionPanel,
    mount: minecraftBundle.panels.mount,
    skin: minecraftBundle.panels.skin,
    log: minecraftBundle.panels.log,
  },
};

export default bundle;
