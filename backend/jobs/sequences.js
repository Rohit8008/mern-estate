import Sequence from '../models/sequence.model.js';
import SequenceEnrollment from '../models/sequenceEnrollment.model.js';
import Client from '../models/client.model.js';
import Task from '../models/task.model.js';
import { notify } from '../utils/notify.js';
import { sendMail } from '../utils/mailer.js';
import { renderTemplate, templateValues } from '../utils/emailTemplates.js';
import { logger } from '../utils/logger.js';
import Tenant from '../models/tenant.model.js';
import { getTenantId, runWithoutTenantScope } from '../tenancy/tenantContext.js';
import { isSuppressed, signUnsubscribeToken, unsubscribeUrls } from '../utils/unsubscribe.js';

/**
 * Firing the steps that have come due.
 *
 * Runs per workspace on the scheduler. The important properties:
 *
 *  - **A step fires once.** The enrollment is advanced in the same pass, so a
 *    retry or a second instance cannot send the same email twice.
 *  - **A closed lead stops the sequence.** Continuing to chase someone who has
 *    already bought, or who said no, is the single worst thing an automation
 *    like this can do.
 *  - **A failing step does not wedge the enrollment.** It advances anyway, with
 *    the failure recorded, so one bad address does not freeze the rest.
 *  - **An unsubscribed address gets no email.** The workspace suppression list
 *    is checked at send time, every time, and every email carries a working
 *    unsubscribe link plus the List-Unsubscribe headers mail providers require
 *    for one-click unsubscribe. Task and reminder steps still fire: they go to
 *    the agent, not the lead.
 */

/** Merge fields available to a step's subject and body. */
function valuesForClient(client) {
  const [firstName = ''] = String(client.name || '').split(' ');
  return templateValues({
    recipientName: client.name || '',
    firstName,
    lastName: String(client.name || '').split(' ').slice(1).join(' '),
    phone: client.phone || '',
    email: client.email || '',
  });
}

/**
 * The lines every automated email ends with: who is writing and why, and how
 * to stop it. Plain text, like the body.
 */
function emailFooter(workspace, urls) {
  const sender = workspace?.name || 'the agency';
  return `\n\n--\nYou are receiving this because you enquired with ${sender}.\nTo stop these emails: ${urls.page}`;
}

/** The message a sequence email step sends. Exported for tests. */
export function buildFollowUpEmail({ client, workspace, subject, body, tenantId }) {
  const token = signUnsubscribeToken({ tenantId, clientId: client._id });
  const urls = unsubscribeUrls(workspace, token);
  return {
    to: client.email,
    subject: subject || `A message about your property search`,
    text: `${body}${emailFooter(workspace, urls)}`,
    headers: {
      // RFC 2369 + RFC 8058: the mail client's own Unsubscribe button, which
      // POSTs here without opening a page. Gmail and Yahoo require both
      // headers from bulk senders.
      'List-Unsubscribe': `<${urls.oneClick}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

/** Do what one step says. Returns a short outcome for the history. */
async function fireStep(step, { client, enrollment, workspace }) {
  const values = valuesForClient(client);
  const subject = renderTemplate(step.subject || '', values);
  const body = renderTemplate(step.body || '', values);

  if (step.action === 'email') {
    if (!client.email) return 'skipped: no email address';
    if (await isSuppressed(client.email)) return 'skipped: unsubscribed';

    const result = await sendMail(
      buildFollowUpEmail({ client, workspace, subject, body, tenantId: getTenantId() })
    );

    return result.sent ? 'email sent' : `email failed: ${result.reason || 'unknown'}`;
  }

  if (step.action === 'task') {
    await Task.create({
      title: subject || `Follow up with ${client.name || 'lead'}`,
      description: body,
      dueAt: new Date(),
      assignedTo: client.assignedTo,
      createdBy: enrollment.enrolledBy || client.assignedTo,
      related: { kind: 'client', clientId: client._id },
    });
    return 'task created';
  }

  // reminder
  await notify({
    to: client.assignedTo,
    type: 'followup.due',
    title: subject || `Follow up with ${client.name || 'lead'}`,
    body,
    link: `/clients/${client._id}`,
    entity: { type: 'client', id: client._id },
  });
  return 'reminder sent';
}

/**
 * Advance every enrollment whose next step is due, in the current workspace.
 */
export async function runDueSequenceSteps({ batchSize = 100, now = new Date() } = {}) {
  const due = await SequenceEnrollment.find({ status: 'active', nextStepAt: { $lte: now } })
    .sort({ nextStepAt: 1 })
    .limit(batchSize);

  if (!due.length) return 0;

  const sequenceIds = [...new Set(due.map((e) => String(e.sequence)))];
  const sequences = await Sequence.find({ _id: { $in: sequenceIds } }).lean();
  const byId = new Map(sequences.map((s) => [String(s._id), s]));

  // Once per run, for the footer and the unsubscribe links.
  const tenantId = getTenantId();
  const tenant = tenantId
    ? await runWithoutTenantScope('addressing sequence emails', () =>
        Tenant.findById(tenantId).select('name slug customDomain branding').lean())
    : null;
  const workspace = tenant
    ? { name: tenant.branding?.productName || tenant.name, slug: tenant.slug, customDomain: tenant.customDomain }
    : null;

  let fired = 0;

  for (const enrollment of due) {
    const sequence = byId.get(String(enrollment.sequence));
    const client = await Client.findById(enrollment.client).select('name email phone assignedTo status isDeleted');

    // The sequence or the lead went away, or the sequence was switched off.
    if (!sequence || !sequence.isActive || !client || client.isDeleted) {
      enrollment.status = 'stopped';
      enrollment.stoppedReason = !sequence ? 'sequence deleted'
        : !sequence.isActive ? 'sequence paused'
        : 'lead removed';
      await enrollment.save();
      continue;
    }

    // Never chase someone who has already bought or already said no.
    if (['won', 'lost'].includes(client.status)) {
      enrollment.status = 'stopped';
      enrollment.stoppedReason = `lead marked ${client.status}`;
      await enrollment.save();
      continue;
    }

    const step = sequence.steps?.[enrollment.currentStep];
    if (!step) {
      enrollment.status = 'completed';
      await enrollment.save();
      continue;
    }

    let outcome;
    try {
      outcome = await fireStep(step, { client, enrollment, workspace });
    } catch (err) {
      // Record and move on: one bad step must not freeze the enrollment.
      outcome = `failed: ${err.message}`;
      logger.error('Sequence step failed', {
        enrollment: String(enrollment._id),
        step: enrollment.currentStep,
        message: err.message,
      });
    }

    enrollment.history.push({
      stepIndex: enrollment.currentStep,
      action: step.action,
      firedAt: new Date(),
      outcome,
    });

    const nextIndex = enrollment.currentStep + 1;
    const nextStep = sequence.steps[nextIndex];

    if (nextStep) {
      enrollment.currentStep = nextIndex;
      enrollment.nextStepAt = new Date(now.getTime() + (nextStep.delayDays || 0) * 86400000);
    } else {
      enrollment.currentStep = nextIndex;
      enrollment.status = 'completed';
    }

    await enrollment.save();
    fired += 1;
  }

  return fired;
}

/**
 * Take a lead off every sequence it is on.
 *
 * Called when a lead is won or lost, so the automation stops immediately rather
 * than at the next tick — the gap between "marked won" and "sent another chase
 * email" is exactly the gap a customer notices.
 */
export async function stopSequencesForClient(clientId, reason = 'lead closed') {
  const result = await SequenceEnrollment.updateMany(
    { client: clientId, status: 'active' },
    { $set: { status: 'stopped', stoppedReason: reason } }
  );
  return result.modifiedCount;
}
