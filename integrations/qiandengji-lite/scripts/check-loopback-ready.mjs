/** The same fake public World loopback also checks full readiness, foreign accounts and stop. */
import {checkLoopback} from './check-loopback-login.mjs';
await checkLoopback(true);
