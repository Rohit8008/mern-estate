import Client from '../models/client.model.js';

/**
 * Keep lead scores honest as time passes.
 *
 * The score has a recency factor, which means it decays — a lead that was busy
 * last month is worth less today than it was then. Nothing else recomputes it
 * on a timer, so without this the number only moves when somebody touches the
 * record, and a stale lead keeps the score it earned when it was warm.
 *
 * Runs per workspace, inside that workspace's tenant scope.
 */
export async function rescoreLeads({ batchSize = 1000 } = {}) {
  // Only open leads: a won or lost record's score is history, and rewriting it
  // would quietly change what past reports say.
  const clients = await Client.find({
    isDeleted: { $ne: true },
    status: { $nin: ['won', 'lost'] },
  }).limit(batchSize);

  let changed = 0;

  for (const client of clients) {
    const before = client.score;
    const beforeTemp = client.temperature;

    client.calculateScore();

    if (client.score !== before || client.temperature !== beforeTemp) {
      // Skip validation and middleware: this writes two derived fields and
      // should not fail on an unrelated field that was already invalid.
      await Client.updateOne(
        { _id: client._id },
        {
          $set: {
            score: client.score,
            scoreFactors: client.scoreFactors,
            temperature: client.temperature,
          },
        }
      );
      changed += 1;
    }
  }

  return changed;
}
