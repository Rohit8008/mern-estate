import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient, fetchWithRefresh, handleApiResponse, parseJsonSafely } from '../utils/http';
import { FaPhone, FaEnvelope, FaWhatsapp, FaCalendar, FaPlus, FaCheck, FaRupeeSign } from 'react-icons/fa';

const DEAL_STAGES = [
  { id: 'initial_contact', label: 'Initial Contact', color: 'bg-slate-100' },
  { id: 'site_visit_scheduled', label: 'Visit Scheduled', color: 'bg-blue-100' },
  { id: 'site_visit_done', label: 'Visit Done', color: 'bg-indigo-100' },
  { id: 'negotiation', label: 'Negotiation', color: 'bg-purple-100' },
  { id: 'documentation', label: 'Documentation', color: 'bg-amber-100' },
  { id: 'payment_pending', label: 'Payment Pending', color: 'bg-orange-100' },
  { id: 'closed_won', label: 'Won', color: 'bg-green-100' },
  { id: 'closed_lost', label: 'Lost', color: 'bg-red-100' },
];

const FOLLOW_UP_TYPES = [
  { id: 'call', label: 'Call', icon: FaPhone },
  { id: 'email', label: 'Email', icon: FaEnvelope },
  { id: 'whatsapp', label: 'WhatsApp', icon: FaWhatsapp },
  { id: 'meeting', label: 'Meeting', icon: FaCalendar },
  { id: 'site_visit', label: 'Site Visit', icon: FaCalendar },
];

const COMM_TYPES = ['call', 'email', 'sms', 'meeting', 'whatsapp', 'site_visit', 'note'];

export default function ClientDetail() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  const docQuery = useMemo(() => `?kind=client&clientId=${id}&limit=50`, [id]);
  const taskQuery = useMemo(() => `?kind=client&clientId=${id}&limit=50`, [id]);

  // Load client and summary
  async function loadClient() {
    try {
      setLoading(true);
      const [clientRes, summaryRes] = await Promise.all([
        apiClient.get(`/clients/${id}`),
        apiClient.get(`/crm/${id}/summary`),
      ]);
      setClient(clientRes?.data || clientRes);
      setSummary(summaryRes?.data || null);
    } catch (e) {
      setError(e?.message || 'Failed to load client');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClient();
  }, [id]);

  // Add Deal
  async function handleAddDeal(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      stage: form.get('stage') || 'initial_contact',
      value: Number(form.get('value')) || 0,
      notes: form.get('notes') || '',
      commissionPercentage: Number(form.get('commission')) || 0,
    };
    try {
      await apiClient.post(`/crm/${id}/deals`, payload);
      e.currentTarget.reset();
      await loadClient();
    } catch (_) {}
  }

  // Update Deal Stage
  async function updateDealStage(dealId, newStage) {
    try {
      await apiClient.request(`/crm/${id}/deals/${dealId}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: newStage }),
      });
      await loadClient();
    } catch (_) {}
  }

  // Add Follow-up
  async function handleAddFollowUp(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      dueAt: form.get('dueAt'),
      type: form.get('type') || 'call',
      notes: form.get('notes') || '',
    };
    try {
      await apiClient.post(`/crm/${id}/follow-ups`, payload);
      e.currentTarget.reset();
      await loadClient();
    } catch (_) {}
  }

  // Complete Follow-up
  async function completeFollowUp(followUpId) {
    try {
      await apiClient.request(`/crm/${id}/follow-ups/${followUpId}/complete`, {
        method: 'PATCH',
        body: JSON.stringify({ outcome: 'Completed' }),
      });
      await loadClient();
    } catch (_) {}
  }

  // Add Communication
  async function handleAddCommunication(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      type: form.get('type') || 'note',
      direction: form.get('direction') || 'outbound',
      summary: form.get('summary'),
      details: form.get('details') || '',
    };
    try {
      await apiClient.post(`/crm/${id}/communications`, payload);
      e.currentTarget.reset();
      await loadClient();
    } catch (_) {}
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

  async function handleUpload(e) {
    e.preventDefault();
    const file = e.currentTarget.elements.file.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', 'client');
      form.append('clientId', id);
      form.append('title', file.name);
      const res = await fetchWithRefresh('/api/documents/upload', {
        method: 'POST',
        body: form,
      });
      await handleApiResponse(res);
      e.currentTarget.reset();
      await loadDocs();
    } catch (_) {
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateTask(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      title: form.get('title')?.toString() || '',
      description: form.get('description')?.toString() || '',
      dueAt: form.get('dueAt') ? new Date(form.get('dueAt').toString()).toISOString() : null,
      priority: form.get('priority')?.toString() || 'medium',
      related: { kind: 'client', clientId: id },
    };
    setCreatingTask(true);
    try {
      await apiClient.post('/tasks', payload);
      e.currentTarget.reset();
      await loadTasks();
    } catch (_) {
    } finally {
      setCreatingTask(false);
    }
  }

  async function toggleTaskStatus(t) {
    const next = t.status === 'done' ? 'todo' : 'done';
    try {
      await apiClient.request(`/tasks/${t._id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      await loadTasks();
    } catch (_) {}
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!client) return <div className="p-4">Not found</div>;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'deals', label: `Deals (${client.deals?.length || 0})` },
    { id: 'followups', label: `Follow-ups (${client.followUps?.filter(f => !f.completed).length || 0})` },
    { id: 'communications', label: `Activity (${client.communications?.length || 0})` },
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
            <span className={`px-2 py-0.5 rounded text-xs capitalize ${
              client.status === 'won' ? 'bg-green-100 text-green-700' :
              client.status === 'lost' ? 'bg-red-100 text-red-700' :
              'bg-slate-100 text-slate-700'
            }`}>{client.status}</span>
            <span className={`px-2 py-0.5 rounded text-xs capitalize ${
              client.priority === 'urgent' ? 'bg-red-100 text-red-700' :
              client.priority === 'high' ? 'bg-orange-100 text-orange-700' :
              'bg-slate-100 text-slate-700'
            }`}>{client.priority}</span>
          </div>
        </div>
        <Link to="/clients" className="text-blue-600 hover:underline">Back to Clients</Link>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm text-slate-500">Active Deals</div>
            <div className="text-2xl font-bold">{summary.deals?.active || 0}</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm text-slate-500">Won Value</div>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(summary.deals?.wonValue)}</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm text-slate-500">Pending Follow-ups</div>
            <div className="text-2xl font-bold text-amber-600">{summary.followUps?.pending || 0}</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm text-slate-500">Lead Score</div>
            <div className="text-2xl font-bold">{client.score || 0}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-4">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border p-4">
              <h3 className="font-semibold mb-3">Contact Information</h3>
              <div className="space-y-2 text-sm">
                <div><span className="text-slate-500">Email:</span> {client.email || '—'}</div>
                <div><span className="text-slate-500">Phone:</span> {client.phone || '—'}</div>
                <div><span className="text-slate-500">Alt Phone:</span> {client.alternatePhone || '—'}</div>
                <div><span className="text-slate-500">Organization:</span> {client.organization || '—'}</div>
                <div><span className="text-slate-500">Source:</span> {client.source || '—'}</div>
              </div>
            </div>
            <div className="bg-white rounded-lg border p-4">
              <h3 className="font-semibold mb-3">Requirements</h3>
              <div className="space-y-2 text-sm">
                <div><span className="text-slate-500">Budget:</span> {client.budget?.min || client.budget?.max ? `${formatCurrency(client.budget.min)} - ${formatCurrency(client.budget.max)}` : '—'}</div>
                <div><span className="text-slate-500">Property Type:</span> {client.propertyType || '—'}</div>
                <div><span className="text-slate-500">Locations:</span> {client.preferredLocations?.join(', ') || '—'}</div>
                <div><span className="text-slate-500">Tags:</span> {client.tags?.join(', ') || '—'}</div>
              </div>
            </div>
            <div className="bg-white rounded-lg border p-4 md:col-span-2">
              <h3 className="font-semibold mb-3">Notes</h3>
              <p className="text-sm whitespace-pre-wrap">{client.notes || '—'}</p>
              {client.requirements && (
                <>
                  <h4 className="font-medium mt-4 mb-2">Detailed Requirements</h4>
                  <p className="text-sm whitespace-pre-wrap">{client.requirements}</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Deals Tab */}
        {activeTab === 'deals' && (
          <div className="space-y-4">
            {/* Add Deal Form */}
            <div className="bg-white rounded-lg border p-4">
              <h3 className="font-semibold mb-3">Add New Deal</h3>
              <form onSubmit={handleAddDeal} className="grid md:grid-cols-4 gap-3">
                <select name="stage" className="border rounded px-3 py-2">
                  {DEAL_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <input name="value" type="number" placeholder="Deal Value" className="border rounded px-3 py-2" />
                <input name="commission" type="number" placeholder="Commission %" max="100" className="border rounded px-3 py-2" />
                <input name="notes" placeholder="Notes" className="border rounded px-3 py-2" />
                <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded flex items-center gap-2">
                  <FaPlus /> Add Deal
                </button>
              </form>
            </div>

            {/* Deal List */}
            <div className="space-y-3">
              {(client.deals || []).map(deal => (
                <div key={deal._id} className={`rounded-lg border p-4 ${DEAL_STAGES.find(s => s.id === deal.stage)?.color || 'bg-white'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-lg">{formatCurrency(deal.value)}</div>
                    <select
                      value={deal.stage}
                      onChange={(e) => updateDealStage(deal._id, e.target.value)}
                      className="border rounded px-2 py-1 text-sm bg-white"
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
                <p className="text-slate-500 text-center py-8">No deals yet</p>
              )}
            </div>
          </div>
        )}

        {/* Follow-ups Tab */}
        {activeTab === 'followups' && (
          <div className="space-y-4">
            {/* Add Follow-up Form */}
            <div className="bg-white rounded-lg border p-4">
              <h3 className="font-semibold mb-3">Schedule Follow-up</h3>
              <form onSubmit={handleAddFollowUp} className="grid md:grid-cols-4 gap-3">
                <input name="dueAt" type="datetime-local" required className="border rounded px-3 py-2" />
                <select name="type" className="border rounded px-3 py-2">
                  {FOLLOW_UP_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <input name="notes" placeholder="Notes" className="border rounded px-3 py-2 md:col-span-2" />
                <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded flex items-center gap-2">
                  <FaPlus /> Schedule
                </button>
              </form>
            </div>

            {/* Follow-up List */}
            <div className="space-y-2">
              {(client.followUps || [])
                .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
                .map(fu => {
                  const isOverdue = !fu.completed && new Date(fu.dueAt) < new Date();
                  return (
                    <div key={fu._id} className={`rounded-lg border p-3 flex items-center justify-between ${fu.completed ? 'bg-slate-50 opacity-60' : isOverdue ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded ${fu.completed ? 'bg-green-100' : 'bg-blue-100'}`}>
                          {FOLLOW_UP_TYPES.find(t => t.id === fu.type)?.icon && (
                            <span className="text-sm">{fu.type}</span>
                          )}
                        </div>
                        <div>
                          <div className="font-medium capitalize">{fu.type.replace('_', ' ')}</div>
                          <div className="text-sm text-slate-500">
                            {new Date(fu.dueAt).toLocaleString()}
                            {isOverdue && <span className="text-red-600 ml-2">Overdue!</span>}
                          </div>
                          {fu.notes && <div className="text-sm">{fu.notes}</div>}
                        </div>
                      </div>
                      {!fu.completed && (
                        <button onClick={() => completeFollowUp(fu._id)} className="px-3 py-1 bg-green-600 text-white rounded text-sm flex items-center gap-1">
                          <FaCheck /> Done
                        </button>
                      )}
                    </div>
                  );
                })}
              {(!client.followUps || client.followUps.length === 0) && (
                <p className="text-slate-500 text-center py-8">No follow-ups scheduled</p>
              )}
            </div>
          </div>
        )}

        {/* Communications Tab */}
        {activeTab === 'communications' && (
          <div className="space-y-4">
            {/* Add Communication Form */}
            <div className="bg-white rounded-lg border p-4">
              <h3 className="font-semibold mb-3">Log Activity</h3>
              <form onSubmit={handleAddCommunication} className="grid md:grid-cols-4 gap-3">
                <select name="type" className="border rounded px-3 py-2">
                  {COMM_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
                <select name="direction" className="border rounded px-3 py-2">
                  <option value="outbound">Outbound</option>
                  <option value="inbound">Inbound</option>
                </select>
                <input name="summary" required placeholder="Summary *" className="border rounded px-3 py-2 md:col-span-2" />
                <textarea name="details" placeholder="Details (optional)" className="border rounded px-3 py-2 md:col-span-4" rows="2" />
                <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded flex items-center gap-2">
                  <FaPlus /> Log Activity
                </button>
              </form>
            </div>

            {/* Communication History */}
            <div className="space-y-2">
              {(client.communications || [])
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map(comm => (
                  <div key={comm._id} className="rounded-lg border p-3 bg-white">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs capitalize ${comm.direction === 'inbound' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                          {comm.direction}
                        </span>
                        <span className="font-medium capitalize">{comm.type}</span>
                      </div>
                      <span className="text-xs text-slate-500">{new Date(comm.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm">{comm.summary}</p>
                    {comm.details && <p className="text-sm text-slate-600 mt-1">{comm.details}</p>}
                  </div>
                ))}
              {(!client.communications || client.communications.length === 0) && (
                <p className="text-slate-500 text-center py-8">No activity logged</p>
              )}
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Documents</h3>
              <button onClick={loadDocs} className="text-sm px-3 py-1 border rounded">Refresh</button>
            </div>

            {docsLoading ? (
              <div>Loading...</div>
            ) : (
              <ul className="space-y-2">
                {docs.map(d => (
                  <li key={d._id} className="border rounded p-3 flex items-center justify-between">
                    <div>
                      <a href={d.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium">{d.title}</a>
                      <div className="text-xs text-slate-600">{d.mimeType} · {(d.size/1024).toFixed(1)} KB</div>
                    </div>
                  </li>
                ))}
                {docs.length === 0 && <li className="text-sm text-slate-500">No documents</li>}
              </ul>
            )}

            <form onSubmit={handleUpload} className="mt-4 flex items-center gap-3">
              <input type="file" name="file" className="border rounded px-3 py-2 flex-1" />
              <button disabled={uploading} className="px-4 py-2 bg-slate-900 text-white rounded">
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
