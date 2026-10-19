import type { WebUiClientBundle } from 'cortico/web/shared/client-panel.ts';
import minecraftBundle from '../adapters/cortico/console/client.ts';
import { connectionPanel } from './connection-panel.ts';
import { quickStartPanel } from './quick-start-panel.ts';

const bundle: WebUiClientBundle = {
  panels: {
    'quick-start': quickStartPanel,
    connection: connectionPanel,
    mount: minecraftBundle.panels.mount,
    skin: minecraftBundle.panels.skin,
    log: minecraftBundle.panels.log,
  },
};

export default bundle;
