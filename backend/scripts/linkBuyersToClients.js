/**
 * ONE-TIME: attach existing buyer requirements to the client with the same phone.
 *
 * A requirement used to carry its own copy of the buyer's name, phone and email
 * with nothing connecting it to the client record, so a person was typed in
 * twice. New requirements link at save time; this links the ones written before.
 *
 * Only an unambiguous match is linked: exactly one client with that phone. A
 * number shared by two clients (a family landline) is reported and left alone,
 * because guessing would attach someone's requirements to the wrong person.
 * Requirements that already have a clientId are never touched. Safe to re-run.
 *
 *   node scripts/linkBuyersToClients.js --workspace <slug> --dry-run
 *   node scripts/linkBuyersToClients.js --workspace <slug>
 */

import { bootstrapScript, models } from './_bootstrap.js';

const DRY_RUN = process.argv.includes('--dry-run');
const log = (...a) => console.log(...a);

async function main() {
  const { tenant, inWorkspace, close } = await bootstrapScript();
  const { phoneKeyOf } = await import('../utils/phoneKey.js');
  log(`${DRY_RUN ? '[DRY RUN] ' : ''}Linking buyer requirements to clients in "${tenant.name}"`);

  await inWorkspace(async () => {
    const clients = await models.Client.find({ isDeleted: { $ne: true }, phone: { $nin: [null, ''] } })
      .select('phone').lean();
    const byKey = new Map();
    for (const c of clients) {
      const key = phoneKeyOf(c.phone);
      if (key.length < 10) continue;
      byKey.set(key, [...(byKey.get(key) || []), c._id]);
    }

    const buyers = await models.BuyerRequirement.find({
      isDeleted: { $ne: true },
      $or: [{ clientId: null }, { clientId: { $exists: false } }],
    }).select('buyerPhone').lean();

    let linked = 0, ambiguous = 0, none = 0;
    for (const b of buyers) {
      const matches = byKey.get(phoneKeyOf(b.buyerPhone)) || [];
      if (matches.length === 1) {
        linked += 1;
        if (!DRY_RUN) await models.BuyerRequirement.updateOne({ _id: b._id }, { $set: { clientId: matches[0] } });
      } else if (matches.length > 1) ambiguous += 1;
      else none += 1;
    }
    log(`Scanned ${buyers.length} unlinked requirements: ${linked} linked, ${ambiguous} ambiguous (left alone), ${none} with no matching client.`);
  });

  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
