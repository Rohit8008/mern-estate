/**
 * Every kind of notification the product can raise.
 *
 * One catalogue, for the same reason permissions have one: the notification
 * model's enum, the per-user preference toggles and the Settings screen all
 * have to agree, and three hand-kept copies would drift.
 *
 * `defaultEmail` decides whether this type also sends mail when the user has
 * expressed no preference. In-app always happens — the bell is the record of
 * what occurred, and silently dropping an event makes the feed a liar.
 */
export const NOTIFICATION_TYPES = Object.freeze({
  'lead.assigned': {
    label: 'Lead assigned to me',
    description: 'When a client or lead is assigned to you',
    defaultEmail: true,
  },
  'deal.stage_changed': {
    label: 'Deal stage changed',
    description: 'When a deal you own moves to a new stage',
    defaultEmail: true,
  },
  'task.assigned': {
    label: 'Task assigned to me',
    description: 'When someone assigns you a task',
    defaultEmail: true,
  },
  'task.due': {
    label: 'Task due',
    description: 'A reminder shortly before one of your tasks is due',
    defaultEmail: true,
  },
  'followup.due': {
    label: 'Follow-up due',
    description: 'A reminder when a scheduled follow-up comes due',
    defaultEmail: true,
  },
  'buyer.match': {
    label: 'New buyer match',
    description: 'When a new listing matches one of your buyer requirements',
    defaultEmail: false,
  },
  'message.received': {
    label: 'New message',
    description: 'When a colleague sends you a message',
    defaultEmail: false,
  },
  'import.finished': {
    label: 'Import finished',
    description: 'When a bulk import you started completes',
    defaultEmail: false,
  },
  'share.viewed': {
    label: 'Shared property viewed',
    description: 'When someone opens a share link you created',
    defaultEmail: false,
  },
  'listing.updated': {
    label: 'Listing updates',
    description: 'When a property you are involved with is created or changed',
    defaultEmail: false,
  },
  'system.alert': {
    label: 'System alerts',
    description: 'Plan limits, trial expiry and other account notices',
    defaultEmail: true,
  },
});

export const NOTIFICATION_TYPE_KEYS = Object.freeze(Object.keys(NOTIFICATION_TYPES));

export const isNotificationType = (type) => NOTIFICATION_TYPE_KEYS.includes(type);

/** The shape stored on the user, with every type defaulted. */
export function defaultNotificationPreferences() {
  return NOTIFICATION_TYPE_KEYS.reduce((prefs, key) => {
    prefs[key] = { inApp: true, email: NOTIFICATION_TYPES[key].defaultEmail };
    return prefs;
  }, {});
}

/**
 * Resolve one type's delivery for a user, falling back to the catalogue default
 * for anything the user has never expressed an opinion about.
 */
export function resolveDelivery(preferences, type) {
  const fallback = {
    inApp: true,
    email: NOTIFICATION_TYPES[type]?.defaultEmail ?? false,
  };
  const stored = preferences?.[type];
  if (!stored) return fallback;

  return {
    inApp: stored.inApp !== false,
    email: stored.email === true,
  };
}
