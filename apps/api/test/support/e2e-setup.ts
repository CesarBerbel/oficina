// Roda via jest `setupFiles`, ANTES de qualquer import de módulo da app. Garante
// que os defaults de ambiente (ex.: AUTH_LOGIN_RATE_LIMIT) já estejam em
// process.env quando o AppModule é carregado — alguns valores são lidos em tempo
// de definição de classe (decorators como @Throttle), cedo demais para beforeAll.
import { ensureE2eEnv } from './e2e-env';

ensureE2eEnv();
