import { useCallback, useId, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { HiChat, HiChevronDown } from 'react-icons/hi';
import { whatsappHref, canWhatsApp, renderMessage } from '../utils/whatsapp';
import { useClickOutside } from '../hooks/useClickOutside';

/**
 * Message an Indian agency actually sends, on the channel it actually uses.
 *
 * Click-to-chat rather than the Business API: no account to approve, no
 * per-message cost, and the message goes from the agent's own WhatsApp, so the
 * client sees a person rather than a broadcast.
 *
 * The honest limit: the agent presses send. Nothing goes out on its own, which
 * is why `onSent` exists — the caller logs the conversation so the CRM still
 * knows it happened.
 */

/**
 * Openers worth having to hand. Deliberately few and specific: a long list of
 * generic templates gets scrolled past, and an agent rewrites the message
 * anyway once WhatsApp opens.
 */
export const MESSAGE_TEMPLATES = [
  {
    id: 'intro',
    label: 'Introduce myself',
    body: 'Hello {{name}}, this is {{agent}} from {{workspace}}. You enquired about property with us — is now a good time to talk?',
  },
  {
    id: 'shortlist',
    label: 'Send a shortlist',
    body: 'Hello {{name}}, here are the properties we discussed:\n\n{{link}}\n\nThe link works for a limited time. Let me know which ones you would like to see.',
  },
  {
    id: 'visit',
    label: 'Arrange a site visit',
    body: 'Hello {{name}}, would you like to visit the property this week? I can arrange a time that suits you.',
  },
  {
    id: 'followup',
    label: 'Follow up',
    body: 'Hello {{name}}, just following up on our conversation. Are you still looking, or shall I keep an eye out for something else?',
  },
];

export default function WhatsAppButton({
  phone,
  values = {},
  onSent,
  compact = false,
  className = '',
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // The shared hook closes on a click outside a CSS selector, so the wrapper
  // carries a unique id — useId keeps two buttons on one screen independent.
  const rawId = useId();
  const scopeId = `wa-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;

  useClickOutside({
    enabled: open,
    selector: `#${scopeId}`,
    onOutsideClick: useCallback(() => setOpen(false), []),
  });

  const usable = useMemo(() => canWhatsApp(phone), [phone]);

  /**
   * Opening WhatsApp counts as reaching out, so the caller is told — but only
   * for a link we actually opened, never on a disabled click.
   */
  const openChat = (template) => {
    const text = template ? renderMessage(template.body, values) : '';
    const href = whatsappHref(phone, text);
    if (!href) return;

    window.open(href, '_blank', 'noopener,noreferrer');
    setOpen(false);
    onSent?.(template ? { templateId: template.id, text } : { templateId: null, text: '' });
  };

  if (!usable) {
    return compact ? null : (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 ${className}`}
        title={t('whatsapp.noNumber')}
      >
        <HiChat className='w-4 h-4' />
        {!compact && t('whatsapp.whatsapp')}
      </span>
    );
  }

  if (compact) {
    return (
      <button
        type='button'
        onClick={() => openChat(null)}
        title={t('whatsapp.openChat')}
        className={`p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200 transition-colors ${className}`}
      >
        <HiChat className='w-4 h-4' />
      </button>
    );
  }

  return (
    <div id={scopeId} className={`relative inline-flex ${className}`}>
      <button
        type='button'
        onClick={() => openChat(null)}
        className='inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-l-lg transition-colors'
      >
        <HiChat className='w-4 h-4' />
        {t('whatsapp.whatsapp')}
      </button>

      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        aria-label={t('whatsapp.chooseMessage')}
        className='px-1.5 text-white bg-emerald-600 hover:bg-emerald-700 rounded-r-lg border-l border-emerald-500 transition-colors'
      >
        <HiChevronDown className='w-4 h-4' />
      </button>

      {open && (
        <div className='absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-30 overflow-hidden'>
          <p className='px-3 py-2 text-xs text-slate-400 border-b border-slate-100'>
            {t('whatsapp.opensInWhatsApp')}
          </p>
          {MESSAGE_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type='button'
              onClick={() => openChat(template)}
              className='block w-full px-3 py-2.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0'
            >
              <span className='block text-sm font-medium text-slate-800'>{template.label}</span>
              <span className='block text-xs text-slate-500 truncate'>
                {renderMessage(template.body, values).split('\n')[0]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

WhatsAppButton.propTypes = {
  phone: PropTypes.string,
  /** Merge values: name, agent, workspace, link. */
  values: PropTypes.object,
  onSent: PropTypes.func,
  compact: PropTypes.bool,
  className: PropTypes.string,
};
