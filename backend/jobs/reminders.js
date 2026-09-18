import Task from '../models/task.model.js';
import Client from '../models/client.model.js';
import { notify } from '../utils/notify.js';

/**
 * The jobs that make the reminder fields mean something.
 *
 * `task.reminders[].sent` and `followUp.reminderSent` have been in the schema
 * since the beginning with nothing to set them, because there was no scheduler.
 * Both flags are the idempotency guard here: a reminder is marked sent in the
 * same pass that raises it, so a retry or a second instance cannot send twice.
 */

/** Tasks whose reminder time has arrived and that are not already done. */
export async function sendTaskReminders(now = new Date()) {
  const tasks = await Task.find({
    isDeleted: { $ne: true },
    status: { $nin: ['done'] },
    reminders: { $elemMatch: { at: { $lte: now }, sent: false } },
  })
    .select('title dueAt assignedTo reminders related')
    .limit(500);

  let sent = 0;

  for (const task of tasks) {
    const due = task.reminders.filter((r) => !r.sent && r.at <= now);
    if (!due.length) continue;

    // Mark first. If the notification fails we would rather drop one reminder
    // than risk a loop that re-sends it every minute.
    await Task.updateOne(
      { _id: task._id },
      { $set: { 'reminders.$[r].sent': true } },
      { arrayFilters: [{ 'r.at': { $lte: now }, 'r.sent': false }] }
    );

    await notify({
      to: task.assignedTo,
      type: 'task.due',
      title: `Task due: ${task.title}`,
      body: task.dueAt ? `Due ${task.dueAt.toISOString().slice(0, 16).replace('T', ' ')} UTC` : '',
      link: '/tasks',
      entity: { type: 'task', id: task._id },
    });

    sent += due.length;
  }

  return sent;
}

/**
 * Follow-ups that have come due.
 *
 * Follow-ups are sub-documents of Client, so this reaches them with a positional
 * filtered update rather than loading and saving whole client documents.
 */
export async function sendFollowUpReminders(now = new Date()) {
  const clients = await Client.find({
    isDeleted: { $ne: true },
    followUps: { $elemMatch: { dueAt: { $lte: now }, completed: false, reminderSent: false } },
  })
    .select('name assignedTo followUps')
    .limit(500);

  let sent = 0;

  for (const client of clients) {
    const due = client.followUps.filter((f) => !f.completed && !f.reminderSent && f.dueAt <= now);
    if (!due.length) continue;

    await Client.updateOne(
      { _id: client._id },
      { $set: { 'followUps.$[f].reminderSent': true } },
      { arrayFilters: [{ 'f.dueAt': { $lte: now }, 'f.completed': false, 'f.reminderSent': false }] }
    );

    await notify({
      to: client.assignedTo,
      type: 'followup.due',
      title: `Follow-up due: ${client.name || 'client'}`,
      body: due[0].notes || `A ${due[0].type} follow-up is due.`,
      link: `/clients/${client._id}`,
      entity: { type: 'client', id: client._id },
    });

    sent += due.length;
  }

  return sent;
}
