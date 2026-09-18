import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiTemplate, HiEye, HiPaperAirplane, HiRefresh } from 'react-icons/hi';
import { Input, Textarea, Button, Modal, Badge } from '../design-system';
import { apiClient } from '../utils/http';
import { useNotification } from '../contexts/NotificationContext';

/**
 * Per-workspace wording for the emails the product sends.
 *
 * Every outbound email used to be a hand-built HTML string inside whichever
 * controller sent it, so an agency could not change a word of what went out
 * under their name.
 *
 * A template is optional: where none is written, the built-in copy is used. So
 * this is a customisation screen, not a setup step — which is why it lists every
 * key rather than only the ones already overridden.
 */
export default function EmailTemplatesPanel() {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotification();

  const [templates, setTemplates] = useState([]);
  const [variables, setVariables] = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ subject: '', html: '' });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/email-templates');
      setTemplates(res?.data?.templates || []);
      setVariables(res?.data?.variables || {});
    } catch {
      showError('Could not load email templates');
    }
    setLoading(false);
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const open = (template) => {
    setEditing(template);
    setDraft({
      subject: template.subject || '',
      html: template.html || DEFAULT_BODY,
    });
    setPreview(null);
  };

  const save = async () => {
    setBusy(true);
    try {
      await apiClient.put(`/email-templates/${editing.key}`, draft);
      showSuccess('Template saved');
      setEditing(null);
      load();
    } catch (err) {
      showError(err?.message || 'Could not save the template');
    }
    setBusy(false);
  };

  const revert = async (key) => {
    try {
      await apiClient.delete(`/email-templates/${key}`);
      showSuccess('Reverted to the default wording');
      setEditing(null);
      load();
    } catch (err) {
      showError(err?.message || 'Could not revert');
    }
  };

  const showPreview = async () => {
    try {
      const res = await apiClient.post('/email-templates/preview', draft);
      setPreview(res?.data || null);
    } catch (err) {
      showError(err?.message || 'Could not render a preview');
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post('/email-templates/test', draft);
      showSuccess(res?.message || 'Sent');
    } catch (err) {
      showError(err?.message || 'Could not send the test');
    }
    setBusy(false);
  };

  return (
    <div className='space-y-4'>
      <div className='bg-white rounded-xl border border-slate-200 p-5'>
        <div className='flex items-center gap-3 mb-5'>
          <div className='w-9 h-9 rounded-xl bg-sky-50 ring-1 ring-sky-100 flex items-center justify-center flex-shrink-0'>
            <HiTemplate className='w-5 h-5 text-sky-600' />
          </div>
          <div>
            <h2 className='text-base font-semibold text-slate-900'>Email templates</h2>
            <p className='text-xs text-slate-500'>
              Your own wording for what the CRM sends. Anything you don&rsquo;t customise uses the built-in copy.
            </p>
          </div>
        </div>

        {loading ? (
          <p className='text-sm text-slate-400 py-4'>{t('common.loading')}</p>
        ) : (
          <ul className='divide-y divide-slate-100'>
            {templates.map((template) => (
              <li key={template.key} className='flex items-center justify-between gap-3 py-3'>
                <div className='min-w-0'>
                  <p className='text-sm font-medium text-slate-800'>{template.key}</p>
                  {template.customised && (
                    <p className='text-xs text-slate-500 truncate'>{template.subject}</p>
                  )}
                </div>
                <div className='flex items-center gap-2 flex-shrink-0'>
                  {template.customised
                    ? <Badge variant='brand'>Customised</Badge>
                    : <Badge variant='slate'>Default</Badge>}
                  <Button variant='secondary' onClick={() => open(template)}>{t('common.edit')}</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.key}
          description='Use {{variables}} to insert values. Unknown names are left visible so a typo is obvious.'
          size='2xl'
          footer={
            <>
              {editing.customised && (
                <Button variant='secondary' icon={HiRefresh} onClick={() => revert(editing.key)}>
                  Use default
                </Button>
              )}
              <Button variant='secondary' icon={HiEye} onClick={showPreview}>Preview</Button>
              <Button variant='secondary' icon={HiPaperAirplane} onClick={sendTest} disabled={busy}>
                Send to me
              </Button>
              <Button onClick={save} disabled={busy || !draft.subject || !draft.html}>
                {busy ? t('common.saving') : t('common.save')}
              </Button>
            </>
          }
        >
          <div className='space-y-4'>
            <Input
              label='Subject'
              value={draft.subject}
              onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
            />
            <Textarea
              label='Body (HTML)'
              rows={12}
              value={draft.html}
              onChange={(e) => setDraft((d) => ({ ...d, html: e.target.value }))}
              className='font-mono text-xs'
            />

            <div>
              <p className='text-xs font-medium text-slate-600 mb-1.5'>Available variables</p>
              <div className='flex flex-wrap gap-1.5'>
                {Object.entries(variables).map(([name, description]) => (
                  <button
                    key={name}
                    type='button'
                    title={description}
                    onClick={() => setDraft((d) => ({ ...d, html: `${d.html}{{${name}}}` }))}
                    className='px-2 py-1 text-xs font-mono bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors'
                  >
                    {`{{${name}}}`}
                  </button>
                ))}
              </div>
            </div>

            {preview && (
              <div className='border border-slate-200 rounded-xl overflow-hidden'>
                <div className='px-4 py-2 bg-slate-50 border-b border-slate-200'>
                  <p className='text-xs text-slate-500'>Subject</p>
                  <p className='text-sm font-medium text-slate-800'>{preview.subject}</p>
                </div>
                {/*
                  * Rendered in a sandboxed iframe rather than with
                  * dangerouslySetInnerHTML. The server sanitises the HTML, but a
                  * preview of admin-authored markup should not share this
                  * document's origin, scripts or styles in any case.
                  */}
                <iframe
                  title='Email preview'
                  sandbox=''
                  srcDoc={preview.html}
                  className='w-full h-64 bg-white'
                />
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** A neutral starting point, so an empty editor is not a blank page. */
const DEFAULT_BODY = `<div style="font-family: system-ui, sans-serif; color: #0f172a; line-height: 1.6;">
  <p>Hi {{recipientName}},</p>
  <p><strong>{{title}}</strong></p>
  <p>{{body}}</p>
  <p><a href="{{link}}" style="color: #2b6faa;">Open in {{workspaceName}}</a></p>
  <p style="color: #64748b; font-size: 12px;">Sent by {{workspaceName}} on {{date}}</p>
</div>`;
