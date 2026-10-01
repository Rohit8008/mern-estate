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
  const open = {
    isDeleted: { $ne: true },
    status: { $nin: ['won', 'lost'] },
  };

  let changed = 0;
  let lastId = null;

  // Keyset pages over _id rather than one capped query: a workspace with more
  // than a batch of open leads used to have only the first batch ever rescored,
  // so the rest kept the score they earned when they were warm.
  for (;;) {
    const clients = await Client.find(lastId ? { ...open, _id: { $gt: lastId } } : open)
      .sort({ _id: 1 })
      .limit(batchSize);

    if (!clients.length) break;

    for (const client of clients) {
      const before = client.score;
      const beforeTemp = client.temperature;

      client.calculateScore();

      if (client.score !== before || client.temperature !== beforeTemp) {
        // Skip validation and middleware: this writes derived fields and should
        // not fail on an unrelated field that was already invalid.
        //
        // timestamps:false matters: recency falls back to updatedAt when there
        // is no lastContactAt, so a rescore that bumped updatedAt would make
        // every lead look freshly touched and the decay would never happen.
        await Client.updateOne(
          { _id: client._id },
          {
            $set: {
              score: client.score,
              scoreFactors: client.scoreFactors,
              temperature: client.temperature,
            },
          },
          { timestamps: false }
        );
        changed += 1;
      }
    }

    lastId = clients[clients.length - 1]._id;
    if (clients.length < batchSize) break;
  }

  return changed;
}
