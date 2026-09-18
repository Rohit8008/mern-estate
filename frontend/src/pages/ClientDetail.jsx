import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../utils/http';
import { HiPhone, HiMail, HiChat, HiCalendar, HiPlusSm, HiCheck } from 'react-icons/hi';
import { Card, Badge, Input, Select, Textarea, Button } from '../design-system';
import { currencySymbol, formatCurrency, getLocaleConfig } from '../utils/currency';
import TagPicker from '../components/TagPicker';
import { useNotification } from '../contexts/NotificationContext';
import TemperatureControl from '../components/TemperatureControl';
import SequenceEnrollments from '../components/SequenceEnrollments';
import ClientPhotos from '../components/ClientPhotos';
import { useTranslation } from 'react-i18next';

const DEAL_STAGES = [
  // Professional stages
  { id: 'new_lead', label: 'New Lead', color: 'bg-slate-100' },
  { id: 'contacted', label: 'Contacted', color: 'bg-blue-100' },
  { id: 'qualified', label: 'Qualified', color: 'bg-indigo-100' },
  { id: 'site_visit_scheduled', label: 'Site Visit Scheduled', color: 'bg-purple-100' },
  { id: 'negotiation', label: 'Negotiation', color: 'bg-amber-100' },
  { id: 'booking_token', label: 'Booking / Token', color: 'bg-orange-100' },
  { id: 'documentation', label: 'Documentation', color: 'bg-yellow-100' },
  { id: 'closed_won', label: 'Closed (Won)', color: 'bg-green-100' },
  { id: 'closed_lost', label: 'Closed (Lost)', color: 'bg-red-100' },

  // Legacy stages (keep selectable for existing data)
  { id: 'initial_contact', label: 'Initial Contact (Legacy)', color: 'bg-slate-100' },
  { id: 'site_visit_done', label: 'Site Visit Done (Legacy)', color: 'bg-indigo-100' },
  { id: 'payment_pending', label: 'Payment Pending (Legacy)', color: 'bg-orange-100' },
];

const FOLLOW_UP_TYPES = [
  { id: 'call', label: 'Call', icon: HiPhone },
  { id: 'email', label: 'Email', icon: HiMail },
  { id: 'whatsapp', label: 'WhatsApp', icon: HiChat },
  { id: 'meeting', label: 'Meeting', icon: HiCalendar },
  { id: 'site_visit', label: 'Site Visit', icon: HiCalendar },
];

const COMM_TYPES = ['call', 'email', 'sms', 'meeting', 'whatsapp', 'site_visit', 'note'];

export default function ClientDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { showError } = useNotification();
  const [client, setClient] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);   // initial page load only
  const [saving, setSaving] = useState(false);     // background refetch after mutations
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  // Requirements inline edit
  const [editingReqs, setEditingReqs] = useState(false);
  const [reqsForm, setReqsForm] = useState({});
  const [reqsSaving, setReqsSaving] = useState(false);

  const docQuery = useMemo(() => `?kind=client&clientId=${id}&limit=50`, [id]);
  const taskQuery = useMemo(() => `?kind=client&clientId=${id}&limit=50`, [id]);

  // Load client and summary — isInitial=true shows full-page loader, false does a silent background refetch
  async function loadClient(isInitial = false) {
    if (isInitial) setLoading(true); else setSaving(true);
    try {
      const [clientRes, summaryRes] = await Promise.all([
        apiClient.get(`/clients/${id}`),
        apiClient.get(`/crm/${id}/summary`),
      ]);
      setClient(clientRes?.data || clientRes);
      setSummary(summaryRes?.data || null);
    } catch (e) {
      setError(e?.message || 'Failed to load client');
    } finally {
      if (isInitial) setLoading(false); else setSaving(false);
    }
  }

  useEffect(() => {
    loadClient(true);
  }, [id]);

  function startEditReqs() {
    setReqsForm({
      propertyType: client.propertyType || '',
      budgetMin: client.budget?.min || '',
      budgetMax: client.budget?.max || '',
      preferredLocations: client.preferredLocations?.join(', ') || '',
      requirements: client.requirements || '',
    });
    setEditingReqs(true);
  }

  async function saveReqs() {
    setReqsSaving(true);
    setFormError('');
    try {
      const { budgetMin, budgetMax, preferredLocations, ...rest } = reqsForm;
      await apiClient.patch(`/clients/${id}`, {
        ...rest,
        preferredLocations: preferredLocations
          ? preferredLocations.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        budget: { min: Number(budgetMin) || 0, max: Number(budgetMax) || 0, currency: getLocaleConfig().currency },
      });
      setEditingReqs(false);
      await loadClient();
    } catch (e) {
      setFormError(e?.message || 'Failed to save requirements');
    } finally {
      setReqsSaving(false);
    }
  }

  // Add Deal
  async function handleAddDeal(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      stage: form.get('stage') || 'new_lead',
      value: Number(form.get('value')) || 0,
      notes: form.get('notes') || '',
      commissionPercentage: Number(form.get('commission')) || 0,
    };
    setFormError('');
    try {
      await apiClient.post(`/crm/${id}/deals`, payload);
      formEl.reset();
      await loadClient();
    } catch (e) {
      setFormError(e?.message || 'Failed to add deal');
    }
  }

  // Update Deal Stage
  async function updateDealStage(dealId, newStage) {
    try {
      await apiClient.patch(`/crm/${id}/deals/${dealId}/stage`, { stage: newStage });
      await loadClient();
    } catch (_) {}
  }

  // Add Follow-up
  async function handleAddFollowUp(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      dueAt: form.get('dueAt'),
      type: form.get('type') || 'call',
      notes: form.get('notes') || '',
    };
    setFormError('');
    try {
      await apiClient.post(`/crm/${id}/follow-ups`, payload);
      formEl.reset();
      await loadClient();
    } catch (e) {
      setFormError(e?.message || 'Failed to schedule follow-up');
    }
  }

  // Complete Follow-up
  async function completeFollowUp(followUpId) {
    try {
      await apiClient.patch(`/crm/${id}/follow-ups/${followUpId}/complete`, { outcome: 'Completed' });
      await loadClient();
    } catch (_) {}
  }

  // Add Communication
  async function handleAddCommunication(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      type: form.get('type') || 'note',
      direction: form.get('direction') || 'outbound',
      summary: form.get('summary'),
      details: form.get('details') || '',
    };
    setFormError('');
    try {
      await apiClient.post(`/crm/${id}/communications`, payload);
      formEl.reset();
      await loadClient();
    } catch (e) {
      setFormError(e?.message || 'Failed to log activity');
    }
  }

  async function loadDocs() {
    setDocsLoading(true);
    try {
      const data = await apiClient.get(`/documents${docQuery}`);
      setDocs(data?.data || []);
    } catch (e) {
      // error surfaced by global handler
    } finally {
      setDocsLoading(false);
    }
  }

  async function loadTasks() {
    setTasksLoading(true);
    try {
      const data = await apiClient.get(`/tasks${taskQuery}`);
      setTasks(data?.data || []);
    } catch (e) {
      // error surfaced by global handler
    } finally {
      setTasksLoading(false);
    }
  }

  useEffect(() => { loadDocs(); }, [docQuery]);
  useEffect(() => { loadTasks(); }, [taskQuery]);

  async function loadTimeline() {
    setTimelineLoading(true);
    try {
      const data = await apiClient.get(`/activity?entityType=client&entityId=${id}&limit=100`);
      setTimeline(data?.data?.items || []);
    } catch (e) {
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'timeline') {
      loadTimeline();
    }
  }, [activeTab, id]);

  async function handleUpload(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const file = formEl.elements.file.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', 'client');
      form.append('clientId', id);
      form.append('title', file.name);
      await apiClient.upload('/documents/upload', form);
      formEl.reset();
      await loadDocs();
    } catch (e) {
      setFormError(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateTask(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      title: form.get('title')?.toString() || '',
      description: form.get('description')?.toString() || '',
      dueAt: form.get('dueAt') ? new Date(form.get('dueAt').toString()).toISOString() : null,
      priority: form.get('priority')?.toString() || 'medium',
      related: { kind: 'client', clientId: id },
    };
    setCreatingTask(true);
    setFormError('');
    try {
      await apiClient.post('/tasks', payload);
      formEl.reset();
      await loadTasks();
    } catch (e) {
      setFormError(e?.message || 'Failed to create task');
    } finally {
      setCreatingTask(false);
    }
  }

  async function toggleTaskStatus(t) {
    const next = t.status === 'done' ? 'todo' : 'done';
    try {
      await apiClient.patch(`/tasks/${t._id}`, { status: next });
      await loadTasks();
    } catch (_) {}
  }

  /**
   * Choosing a temperature pins it: the server sets temperatureManual, so the
   * nightly rescore stops overwriting what a person decided.
   */
  const setTemperature = async (temperature) => {
    const previous = client.temperature;
    setClient((c) => ({ ...c, temperature, temperatureManual: true }));
    try {
      await apiClient.patch(`/clients/${client._id}`, { temperature });
    } catch (err) {
      setClient((c) => ({ ...c, temperature: previous }));
      showError(err?.message || 'Could not save that');
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 text-sm">{t('clientDetail.loading')}</div>;
  if (error) return <div className="p-4 text-rose-600 text-sm">{error}</div>;
  if (!client) return <div className="p-4 text-slate-500 text-sm">{t('clientDetail.notFound')}</div>;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'deals', label: `Deals (${client.deals?.length || 0})` },
    { id: 'followups', label: `Follow-ups (${client.followUps?.filter(f => !f.completed).length || 0})` },
    { id: 'timeline', label: 'Timeline' },
    { id: 'communications', label: `Calls/Notes (${client.communications?.length || 0})` },
    { id: 'tasks', label: `Tasks (${tasks.length})` },
    { id: 'documents', label: 'Documents' },
  ];

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{client.name}</h1>
          <div className="text-slate-600 text-sm flex items-center gap-3">
            {client.email && <span>{client.email}</span>}
            {client.phone && <span>{client.phone}</span>}
            <Badge
              variant={client.status === 'won' ? 'success' : client.status === 'lost' ? 'error' : 'default'}
              className='capitalize'
            >
              {client.status}
            </Badge>
            <Badge
              variant={client.priority === 'urgent' ? 'error' : client.priority === 'high' ? 'warning' : 'default'}
              className='capitalize'
            >
              {client.priority}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-slate-400 animate-pulse">{t('clientDetail.saving')}</span>}
          <Link to="/clients" className="text-sm text-slate-600 hover:text-slate-900 hover:underline">{t('clientDetail.clients')}</Link>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <div className="text-sm text-slate-500">{t('clientDetail.activeDeals')}</div>
            <div className="text-2xl font-bold">{summary.deals?.active || 0}</div>
          </Card>
          <Card>
            <div className="text-sm text-slate-500">{t('clientDetail.wonValue')}</div>
            <div className="text-2xl font-bold text-emerald-600">{formatCurrency(summary.deals?.wonValue)}</div>
          </Card>
          <Card>
            <div className="text-sm text-slate-500">{t('clientDetail.pendingFollowUps')}</div>
            <div className="text-2xl font-bold text-amber-600">{summary.followUps?.pending || 0}</div>
          </Card>
          <Card>
            <div className="text-sm text-slate-500">{t('clientDetail.leadScore')}</div>
            <div className="text-2xl font-bold">{client.score || 0}</div>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl flex overflow-x-auto shadow-sm">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all border-b-2 ${
              activeTab === tab.id
                ? 'text-slate-900 border-slate-900 bg-slate-50'
                : 'text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {formError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-2.5 text-sm flex items-center justify-between">
          {formError}
          <button type="button" onClick={() => setFormError('')} className="text-rose-500 hover:text-rose-700 ml-4 shrink-0">✕</button>
        </div>
      )}

      {/* Tab Content */}
      <div className="space-y-4">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <h3 className="font-semibold mb-3">{t('clientDetail.contactInformation')}</h3>
              <div className="space-y-2 text-sm">
                <div><span className="text-slate-500">{t('clientDetail.email')}</span> {client.email || '—'}</div>
                <div><span className="text-slate-500">{t('clientDetail.phone')}</span> {client.phone || '—'}</div>
                <div><span className="text-slate-500">{t('clientDetail.altPhone')}</span> {client.alternatePhone || '—'}</div>
                <div><span className="text-slate-500">{t('clientDetail.organization')}</span> {client.organization || '—'}</div>
                <div><span className="text-slate-500">{t('clientDetail.source')}</span> {client.source || '—'}</div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{t('clientDetail.requirements')}</h3>
                {!editingReqs && (
                  <button
                    onClick={startEditReqs}
                    className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 border border-indigo-200 rounded transition-colors"
                  >{t('clientDetail.edit')}</button>
                )}
              </div>
              {editingReqs ? (
                <div className="space-y-3">
                  <Select
                    label={t('clientDetail.propertyType')}
                    value={reqsForm.propertyType}
                    onChange={(e) => setReqsForm((p) => ({ ...p, propertyType: e.target.value }))}
                  >
                    <option value="">{t('clientDetail.any')}</option>
                    <option value="residential">{t('clientDetail.residential')}</option>
                    <option value="commercial">{t('clientDetail.commercial')}</option>
                    <option value="plot">{t('clientDetail.plotLand')}</option>
                    <option value="villa">{t('clientDetail.villa')}</option>
                    <option value="apartment">{t('clientDetail.apartment')}</option>
                    <option value="office">{t('clientDetail.office')}</option>
                    <option value="shop">{t('clientDetail.shop')}</option>
                    <option value="warehouse">{t('clientDetail.warehouse')}</option>
                  </Select>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label={`Budget Min (${currencySymbol()})`}
                      type="number"
                      value={reqsForm.budgetMin}
                      onChange={(e) => setReqsForm((p) => ({ ...p, budgetMin: e.target.value }))}
                      placeholder="0"
                      min={0}
                    />
                    <Input
                      label={`Budget Max (${currencySymbol()})`}
                      type="number"
                      value={reqsForm.budgetMax}
                      onChange={(e) => setReqsForm((p) => ({ ...p, budgetMax: e.target.value }))}
                      placeholder="0"
                      min={0}
                    />
                  </div>
                  <Input
                    label={t('clientDetail.preferredLocations')}
                    type="text"
                    value={reqsForm.preferredLocations}
                    onChange={(e) => setReqsForm((p) => ({ ...p, preferredLocations: e.target.value }))}
                    placeholder="Bandra, Andheri (comma-separated)"
                  />
                  <Textarea
                    label={t('clientDetail.detailedRequirements')}
                    value={reqsForm.requirements}
                    onChange={(e) => setReqsForm((p) => ({ ...p, requirements: e.target.value }))}
                    rows={3}
                    placeholder={t('clientDetail.3bhkSouthFacingNearSchool')}
                  />
                  <div className="flex gap-2 pt-1">
                    <Button onClick={saveReqs} disabled={reqsSaving} loading={reqsSaving} size='xs'>
                      {reqsSaving ? 'Saving…' : 'Save'}
                    </Button>
                    <Button onClick={() => setEditingReqs(false)} variant='secondary' size='xs'>{t('clientDetail.cancel')}</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <div><span className="text-slate-500">{t('clientDetail.budget')}</span> {client.budget?.min || client.budget?.max ? `${formatCurrency(client.budget.min)} – ${formatCurrency(client.budget.max)}` : '—'}</div>
                  <div><span className="text-slate-500">{t('clientDetail.propertyType2')}</span> {client.propertyType || '—'}</div>
                  <div><span className="text-slate-500">{t('clientDetail.locations')}</span> {client.preferredLocations?.join(', ') || '—'}</div>
                  {/*
                    * Editable, and backed by the workspace taxonomy.
                    * `client.tags` was a render-only string array with no input
                    * anywhere in the product, so nobody could ever set one.
                    */}
                  <div className="flex items-start gap-2">
                    <span className="text-slate-500 flex-shrink-0 pt-0.5">{t('clientDetail.tags')}</span>
                    <TagPicker
                      kind="client"
                      recordId={client._id}
                      value={client.tagIds || []}
                      onChange={(tagIds) => setClient((c) => ({ ...c, tagIds }))}
                    />
                  </div>
                  {client.requirements && (
                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-slate-500 block mb-1">{t('clientDetail.requirements2')}</span>
                      <p className="whitespace-pre-wrap">{client.requirements}</p>
                    </div>
                  )}
                  {!client.requirements && !client.propertyType && !client.budget?.min && !client.budget?.max && (
                    <p className="text-slate-400 text-xs italic">{t('clientDetail.noRequirementsSetClickEditTo')}</p>
                  )}
                </div>
              )}
            </Card>
            <Card>
              <h3 className="font-semibold mb-3">{t('clientDetail.temperature')}</h3>
              <TemperatureControl
                value={client.temperature}
                manual={client.temperatureManual}
                score={client.score}
                onChange={setTemperature}
              />
            </Card>

            <Card>
              <SequenceEnrollments clientId={client._id} clientStatus={client.status} />
            </Card>

            <Card>
              <ClientPhotos
                clientId={client._id}
                photos={client.photos || []}
                onChange={(photos) => setClient((c) => ({ ...c, photos }))}
              />
            </Card>

            <Card className='md:col-span-2'>
              <h3 className="font-semibold mb-3">{t('clientDetail.notes')}</h3>
              <p className="text-sm whitespace-pre-wrap">{client.notes || '—'}</p>
            </Card>
          </div>
        )}

        {/* Timeline Tab */}
        {activeTab === 'timeline' && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{t('clientDetail.timeline')}</h3>
              <Button onClick={loadTimeline} disabled={timelineLoading} variant='secondary' size='sm'>{t('clientDetail.refresh')}</Button>
            </div>

            {timelineLoading && <div className="text-sm text-slate-500">{t('clientDetail.loadingTimeline')}</div>}

            {!timelineLoading && timeline.length === 0 && (
              <div className="text-sm text-slate-500">{t('clientDetail.noTimelineEventsYet')}</div>
            )}

            <div className="space-y-3">
              {timeline.map((ev) => (
                <div key={ev._id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-medium text-sm">{ev.message || ev.action}</div>
                    <div className="text-xs text-slate-500">{new Date(ev.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {ev.createdBy?.username ? `By ${ev.createdBy.username}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Deals Tab */}
        {activeTab === 'deals' && (
          <div className="space-y-4">
            {/* Add Deal Form */}
            <Card>
              <h3 className="font-semibold mb-3">{t('clientDetail.addNewDeal')}</h3>
              <form onSubmit={handleAddDeal} className="grid md:grid-cols-4 gap-3 items-end">
                <Select name="stage" className='mb-0'>
                  {DEAL_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </Select>
                <Input name="value" type="number" placeholder={t('clientDetail.dealValue')} className='mb-0' />
                <Input name="commission" type="number" placeholder={t('clientDetail.commission')} max="100" className='mb-0' />
                <Input name="notes" placeholder={t('clientDetail.notes')} className='mb-0' />
                <Button type="submit" icon={HiPlusSm} className='md:col-span-4 justify-center'>{t('clientDetail.addDeal')}</Button>
              </form>
            </Card>

            {/* Deal List */}
            <div className="space-y-3">
              {(client.deals || []).map(deal => (
                <div key={deal._id} className={`rounded-lg border border-slate-200 p-4 ${DEAL_STAGES.find(s => s.id === deal.stage)?.color || 'bg-white'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-lg">{formatCurrency(deal.value)}</div>
                    <select
                      value={deal.stage}
                      onChange={(e) => updateDealStage(deal._id, e.target.value)}
                      className="border border-slate-300 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    >
                      {DEAL_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="text-sm text-slate-600">
                    <span>Commission: {deal.commission?.percentage}% ({formatCurrency(deal.commission?.amount)})</span>
                    <span className="ml-3 capitalize">Status: {deal.commission?.status}</span>
                  </div>
                  {deal.notes && <p className="text-sm mt-2">{deal.notes}</p>}
                </div>
              ))}
              {(!client.deals || client.deals.length === 0) && (
                <p className="text-slate-500 text-center py-8">{t('clientDetail.noDealsYet')}</p>
              )}
            </div>
          </div>
        )}

        {/* Follow-ups Tab */}
        {activeTab === 'followups' && (
          <div className="space-y-4">
            {/* Add Follow-up Form */}
            <Card>
              <h3 className="font-semibold mb-3">{t('clientDetail.scheduleFollowUp')}</h3>
              <form onSubmit={handleAddFollowUp} className="grid md:grid-cols-4 gap-3 items-end">
                <Input name="dueAt" type="datetime-local" required className='mb-0' />
                <Select name="type" className='mb-0'>
                  {FOLLOW_UP_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Select>
                <Input name="notes" placeholder={t('clientDetail.notes')} className="mb-0 md:col-span-2" />
                <Button type="submit" icon={HiPlusSm} className='md:col-span-4 justify-center'>{t('clientDetail.schedule')}</Button>
              </form>
            </Card>

            {/* Follow-up List */}
            <div className="space-y-2">
              {(client.followUps || [])
                .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
                .map(fu => {
                  const isOverdue = !fu.completed && new Date(fu.dueAt) < new Date();
                  return (
                    <div key={fu._id} className={`rounded-lg border p-3 flex items-center justify-between ${fu.completed ? 'bg-slate-50 border-slate-200 opacity-60' : isOverdue ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${fu.completed ? 'bg-emerald-100' : 'bg-indigo-100'}`}>
                          {FOLLOW_UP_TYPES.find(t => t.id === fu.type)?.icon && (
                            <span className="text-sm">{fu.type}</span>
                          )}
                        </div>
                        <div>
                          <div className="font-medium capitalize">{fu.type.replace('_', ' ')}</div>
                          <div className="text-sm text-slate-500">
                            {new Date(fu.dueAt).toLocaleString()}
                            {isOverdue && <span className="text-rose-600 ml-2">{t('clientDetail.overdue')}</span>}
                          </div>
                          {fu.notes && <div className="text-sm">{fu.notes}</div>}
                        </div>
                      </div>
                      {!fu.completed && (
                        <button
                          type='button'
                          onClick={() => completeFollowUp(fu._id)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
                        >
                          <HiCheck className='w-4 h-4' />{t('clientDetail.done')}</button>
                      )}
                    </div>
                  );
                })}
              {(!client.followUps || client.followUps.length === 0) && (
                <p className="text-slate-500 text-center py-8">{t('clientDetail.noFollowUpsScheduled')}</p>
              )}
            </div>
          </div>
        )}

        {/* Communications Tab */}
        {activeTab === 'communications' && (
          <div className="space-y-4">
            {/* Add Communication Form */}
            <Card>
              <h3 className="font-semibold mb-3">{t('clientDetail.logActivity')}</h3>
              <form onSubmit={handleAddCommunication} className="grid md:grid-cols-4 gap-3">
                <Select name="type" className='mb-0'>
                  {COMM_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                </Select>
                <Select name="direction" className='mb-0'>
                  <option value="outbound">{t('clientDetail.outbound')}</option>
                  <option value="inbound">{t('clientDetail.inbound')}</option>
                </Select>
                <Input name="summary" required placeholder={t('clientDetail.summary')} className="mb-0 md:col-span-2" />
                <Textarea name="details" placeholder="Details (optional)" className="mb-0 md:col-span-4" rows="2" />
                <Button type="submit" icon={HiPlusSm} className='md:col-span-4 justify-center'>{t('clientDetail.logActivity')}</Button>
              </form>
            </Card>

            {/* Communication History */}
            <div className="space-y-2">
              {(client.communications || [])
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map(comm => (
                  <div key={comm._id} className="rounded-lg border border-slate-200 p-3 bg-white">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={comm.direction === 'inbound' ? 'info' : 'success'} className='capitalize'>
                          {comm.direction}
                        </Badge>
                        <span className="font-medium capitalize">{comm.type}</span>
                      </div>
                      <span className="text-xs text-slate-500">{new Date(comm.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm">{comm.summary}</p>
                    {comm.details && <p className="text-sm text-slate-600 mt-1">{comm.details}</p>}
                  </div>
                ))}
              {(!client.communications || client.communications.length === 0) && (
                <p className="text-slate-500 text-center py-8">{t('clientDetail.noActivityLogged')}</p>
              )}
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{t('clientDetail.documents')}</h3>
              <Button onClick={loadDocs} variant='secondary' size='sm'>{t('clientDetail.refresh')}</Button>
            </div>

            {docsLoading ? (
              <div>{t('clientDetail.loading2')}</div>
            ) : (
              <ul className="space-y-2">
                {docs.map(d => (
                  <li key={d._id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <a href={d.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline font-medium">{d.title}</a>
                      <div className="text-xs text-slate-600">{d.mimeType} · {(d.size/1024).toFixed(1)} KB</div>
                    </div>
                  </li>
                ))}
                {docs.length === 0 && <li className="text-sm text-slate-500">{t('clientDetail.noDocuments')}</li>}
              </ul>
            )}

            <form onSubmit={handleUpload} className="mt-4 flex items-center gap-3">
              <input type="file" name="file" className="border border-slate-300 rounded-lg px-3 py-2 flex-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
              <Button type="submit" disabled={uploading} loading={uploading}>{t('clientDetail.upload')}</Button>
            </form>
          </Card>
        )}

        {activeTab === 'tasks' && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{t('clientDetail.tasks')}</h3>
            </div>

            {tasksLoading ? (
              <div className="text-sm text-slate-500">{t('clientDetail.loading')}</div>
            ) : (
              <ul className="space-y-2 mb-6">
                {tasks.map(t => (
                  <li key={t._id} className="border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleTaskStatus(t)}
                      className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                        t.status === 'done' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {t.status === 'done' && <HiCheck className="w-3 h-3" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${t.status === 'done' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                        {t.title}
                      </div>
                      {t.dueAt && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          Due: {new Date(t.dueAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <Badge variant={t.priority === 'urgent' ? 'error' : t.priority === 'high' ? 'warning' : 'default'} className='capitalize'>
                      {t.priority || 'medium'}
                    </Badge>
                  </li>
                ))}
                {tasks.length === 0 && <li className="text-sm text-slate-500">{t('clientDetail.noTasksYet')}</li>}
              </ul>
            )}

            <form onSubmit={handleCreateTask} className="border-t border-slate-100 pt-4 space-y-3">
              <h4 className="text-sm font-semibold text-slate-700">{t('clientDetail.addTask')}</h4>
              <Input
                name="title"
                required
                placeholder={t('clientDetail.taskTitle')}
                className='mb-0'
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  name="dueAt"
                  type="date"
                  className='mb-0'
                />
                <Select
                  name="priority"
                  defaultValue="medium"
                  className='mb-0'
                >
                  <option value="low">{t('clientDetail.low')}</option>
                  <option value="medium">{t('clientDetail.medium')}</option>
                  <option value="high">{t('clientDetail.high')}</option>
                  <option value="urgent">{t('clientDetail.urgent')}</option>
                </Select>
              </div>
              <Button type="submit" disabled={creatingTask} loading={creatingTask}>{t('clientDetail.addTask2')}</Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
