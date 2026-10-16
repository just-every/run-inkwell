// Run only in run-demo. Retain admissions and connection times, never credentials or requests.
import { appendFileSync, readFileSync } from 'node:fs';
import { demoPlan } from '@runeditrun/rer/internal/modules/demo-host/plan.mjs';
import { tailConnections } from './tail-connection.mjs';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (account !== 'b20c0ca9cab0c2b70e13d7cf724b89bd') throw Error('Expected RunEditRun account');
const deploy = JSON.parse(readFileSync('deploy.json'));
const declaration = JSON.parse(readFileSync('deploy-demo.json'));
const plan = demoPlan({ ...deploy, environment: 'demo-test', declaration, turnstileSiteKey: '1x00000000000000000000AA' });
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${plan.worker}/tails`;
const headers = { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' };
const record = value => appendFileSync('demo-admissions.jsonl', JSON.stringify(value) + '\n');
const windowMs = 15 * 60 * 1000, deadline = Date.now() + 25 * 60 * 1000;
const harness = 'Inkwell-demo-acceptance/dm-inkwell-v24';
let quietSince = Date.now(), heartbeat, observed = false;
const restartWindow = () => {
  quietSince = Date.now();
  record({ observationStarted: new Date(quietSince).toISOString(), worker: plan.worker });
};
const tails = tailConnections(endpoint, headers, record, (admission, at) => {
  record({ at, admission });
  if (admission.agent !== harness) restartWindow();
});
try {
  let current = await tails.open();
  restartWindow();
  // A plain GET sets no cookie and starts no demo; its trace keeps an idle tail active.
  heartbeat = setInterval(() => {
    void fetch(plan.origin, { signal: AbortSignal.timeout(10000) })
      .then(response => response.body?.cancel()).catch(() => {});
  }, 30000);
  while (Date.now() < deadline) {
    if (current.closed) {
      const previous = current;
      current = await tails.open();
      restartWindow();
      await tails.remove(previous);
    }
    if (Date.now() - quietSince >= windowMs) { observed = true; break; }
    if (Date.now() - current.openedAt >= 5 * 60 * 1000) {
      // Open first: expiry or transport rotation must not leave an unobserved gap.
      const previous = current;
      current = await tails.open();
      if (previous.closed) restartWindow();
      record({ tailHandoff: [previous.sequence, current.sequence], continuous: !previous.closed, at: new Date().toISOString() });
      await tails.remove(previous);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!observed) throw Error('No continuous fifteen-minute quiet window within the observation budget');
  record({ observationEnded: new Date().toISOString(), uninterrupted: true });
} finally {
  clearInterval(heartbeat);
  await tails.close();
}
// Node's WebSocket transport can retain idle handles after the tails are deleted.
process.exit(0);
