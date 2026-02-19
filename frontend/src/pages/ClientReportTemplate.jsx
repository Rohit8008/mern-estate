import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { apiClient } from '../utils/http';
import {
  HiRefresh, HiPlus, HiSearch, HiFilter, HiChevronDown, HiX,
  HiDocumentText, HiDownload, HiPrinter, HiMail, HiEye,
  HiPencil, HiTrash, HiDotsVertical, HiTemplate, HiDuplicate,
  HiCalendar, HiUser, HiClipboardList, HiCurrencyDollar,
} from 'react-icons/hi';

const REPORT_TYPES = [
  { id: 'property_summary', label: 'Property Summary', icon: '🏠', description: 'Overview of property details and status' },
  { id: 'market_analysis', label: 'Market Analysis', icon: '📊', description: 'Comparative market analysis report' },
  { id: 'investment_report', label: 'Investment Report', icon: '💰', description: 'ROI and investment potential analysis' },
  { id: 'transaction_history', label: 'Transaction History', icon: '📋', description: 'Complete transaction records' },
  { id: 'client_portfolio', label: 'Client Portfolio', icon: '👤', description: 'Client property holdings summary' },
  { id: 'monthly_summary', label: 'Monthly Summary', icon: '📅', description: 'Monthly activity and performance report' },
];


function TemplateModal({ isOpen, onClose, template, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    type: 'property_summary',
    description: '',
    sections: [],
  });

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name || '',
        type: template.type || 'property_summary',
        description: template.description || '',
        sections: template.sections || [],
      });
    } else {
      setFormData({
        name: '',
        type: 'property_summary',
        description: '',
        sections: [],
      });
    }
  }, [template, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4'>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto'>
        <div className='p-4 border-b border-slate-200 flex items-center justify-between'>
          <h2 className='text-lg font-semibold text-slate-900'>
            {template ? 'Edit Template' : 'Create New Template'}
          </h2>
          <button onClick={onClose} className='text-slate-400 hover:text-slate-600'>
            <HiX className='w-5 h-5' />
          </button>
        </div>
        <form onSubmit={handleSubmit} className='p-4 space-y-4'>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Template Name *</label>
            <input
              type='text'
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
              placeholder='Enter template name'
              required
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Report Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
            >
              {REPORT_TYPES.map((type) => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
              rows={3}
              placeholder='Describe what this template includes...'
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-2'>Include Sections</label>
            <div className='space-y-2'>
              {['Property Details', 'Pricing History', 'Market Comparison', 'Location Analysis', 'Investment Metrics', 'Photos Gallery'].map((section) => (
                <label key={section} className='flex items-center gap-2 cursor-pointer'>
                  <input
                    type='checkbox'
                    checked={formData.sections.includes(section)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, sections: [...formData.sections, section] });
                      } else {
                        setFormData({ ...formData, sections: formData.sections.filter(s => s !== section) });
                      }
                    }}
                    className='w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900'
                  />
                  <span className='text-sm text-slate-700'>{section}</span>
                </label>
              ))}
            </div>
          </div>
          <div className='flex justify-end gap-2 pt-2'>
            <button
              type='button'
              onClick={onClose}
              className='px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium'
            >
              Cancel
            </button>
            <button
              type='submit'
              className='px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-medium'
            >
              {template ? 'Update' : 'Create'} Template
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GenerateReportModal({ isOpen, onClose, templates, onGenerate }) {
  const [formData, setFormData] = useState({
    templateId: '',
    clientName: '',
    propertyName: '',
    notes: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onGenerate(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4'>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto'>
        <div className='p-4 border-b border-slate-200 flex items-center justify-between'>
          <h2 className='text-lg font-semibold text-slate-900'>Generate Report</h2>
          <button onClick={onClose} className='text-slate-400 hover:text-slate-600'>
            <HiX className='w-5 h-5' />
          </button>
        </div>
        <form onSubmit={handleSubmit} className='p-4 space-y-4'>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Select Template *</label>
            <select
              value={formData.templateId}
              onChange={(e) => setFormData({ ...formData, templateId: e.target.value })}
              className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
              required
            >
              <option value=''>Choose a template...</option>
              {templates.map((t) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Client Name *</label>
            <input
              type='text'
              value={formData.clientName}
              onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
              className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
              placeholder='Enter client name'
              required
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Property/Subject *</label>
            <input
              type='text'
              value={formData.propertyName}
              onChange={(e) => setFormData({ ...formData, propertyName: e.target.value })}
              className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
              placeholder='Enter property name or subject'
              required
            />
          </div>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Additional Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
              rows={3}
              placeholder='Any specific notes for this report...'
            />
          </div>
          <div className='flex justify-end gap-2 pt-2'>
            <button
              type='button'
              onClick={onClose}
              className='px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium'
            >
              Cancel
            </button>
            <button
              type='submit'
              className='px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-medium'
            >
              Generate Report
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ClientReportTemplate() {
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();

  const [templates, setTemplates] = useState([]);
  const [generatedReports, setGeneratedReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('templates');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showActionsMenu, setShowActionsMenu] = useState(null);

  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  const getReportTypeInfo = (typeId) => {
    return REPORT_TYPES.find(t => t.id === typeId) || REPORT_TYPES[0];
  };

  const filteredTemplates = useMemo(() => {
    if (!searchQuery) return templates;
    return templates.filter(t => 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [templates, searchQuery]);

  const filteredReports = useMemo(() => {
    if (!searchQuery) return generatedReports;
    return generatedReports.filter(r => 
      r.templateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.propertyName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [generatedReports, searchQuery]);

  const handleSaveTemplate = (formData) => {
    if (editingTemplate) {
      setTemplates(prev => prev.map(t => 
        t._id === editingTemplate._id ? { ...t, ...formData } : t
      ));
    } else {
      const newTemplate = {
        _id: `t-${Date.now()}`,
        ...formData,
        createdAt: new Date().toISOString().split('T')[0],
        lastUsed: null,
        usageCount: 0,
      };
      setTemplates(prev => [newTemplate, ...prev]);
    }
    setEditingTemplate(null);
  };

  const handleGenerateReport = (formData) => {
    const template = templates.find(t => t._id === formData.templateId);
    const newReport = {
      _id: `r-${Date.now()}`,
      templateName: template?.name || 'Unknown Template',
      clientName: formData.clientName,
      propertyName: formData.propertyName,
      generatedAt: new Date().toISOString().split('T')[0],
      status: 'draft',
    };
    setGeneratedReports(prev => [newReport, ...prev]);
    
    // Update template usage
    setTemplates(prev => prev.map(t => 
      t._id === formData.templateId 
        ? { ...t, lastUsed: new Date().toISOString().split('T')[0], usageCount: (t.usageCount || 0) + 1 }
        : t
    ));
  };

  const handleDeleteTemplate = (id) => {
    if (confirm('Are you sure you want to delete this template?')) {
      setTemplates(prev => prev.filter(t => t._id !== id));
    }
    setShowActionsMenu(null);
  };

  const handleDuplicateTemplate = (template) => {
    const duplicate = {
      ...template,
      _id: `t-${Date.now()}`,
      name: `${template.name} (Copy)`,
      createdAt: new Date().toISOString().split('T')[0],
      lastUsed: null,
      usageCount: 0,
    };
    setTemplates(prev => [duplicate, ...prev]);
    setShowActionsMenu(null);
  };

  if (!canAccess) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <p className='text-slate-600'>Access denied</p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
        <div>
          <h1 className='text-xl font-bold text-slate-900'>Client Report Templates</h1>
          <p className='text-sm text-slate-500 mt-1'>Create and manage professional client reports</p>
        </div>
        <div className='flex items-center gap-2'>
          <button
            onClick={() => setShowGenerateModal(true)}
            className='px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium flex items-center gap-1.5 transition-colors'
          >
            <HiDocumentText className='w-4 h-4' />
            Generate Report
          </button>
          <button
            onClick={() => { setEditingTemplate(null); setShowTemplateModal(true); }}
            className='px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-medium flex items-center gap-1.5 transition-colors'
          >
            <HiPlus className='w-4 h-4' />
            New Template
          </button>
        </div>
      </div>

      {/* Report Type Cards */}
      <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3'>
        {REPORT_TYPES.map((type) => (
          <div
            key={type.id}
            className='bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer'
            onClick={() => { setEditingTemplate(null); setShowTemplateModal(true); }}
          >
            <div className='text-2xl mb-2'>{type.icon}</div>
            <h3 className='text-sm font-medium text-slate-900'>{type.label}</h3>
            <p className='text-xs text-slate-500 mt-1 line-clamp-2'>{type.description}</p>
          </div>
        ))}
      </div>

      {/* Tabs & Search */}
      <div className='bg-white border border-slate-200 rounded-xl'>
        <div className='border-b border-slate-200 px-4'>
          <div className='flex items-center justify-between'>
            <div className='flex gap-1'>
              <button
                onClick={() => setActiveTab('templates')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'templates'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Templates ({templates.length})
              </button>
              <button
                onClick={() => setActiveTab('generated')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'generated'
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Generated Reports ({generatedReports.length})
              </button>
            </div>
            <div className='flex items-center gap-2 py-2'>
              <div className='flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white'>
                <HiSearch className='w-4 h-4 text-slate-400' />
                <input
                  type='text'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder='Search...'
                  className='bg-transparent outline-none text-sm text-slate-700 placeholder:text-slate-400 w-40'
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className='text-slate-400 hover:text-slate-600'>
                    <HiX className='w-4 h-4' />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className='p-4'>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {filteredTemplates.map((template) => {
                const typeInfo = getReportTypeInfo(template.type);
                return (
                  <div
                    key={template._id}
                    className='bg-slate-50 border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors'
                  >
                    <div className='flex items-start justify-between mb-3'>
                      <div className='flex items-center gap-3'>
                        <div className='text-2xl'>{typeInfo.icon}</div>
                        <div>
                          <h3 className='text-sm font-semibold text-slate-900'>{template.name}</h3>
                          <p className='text-xs text-slate-500'>{typeInfo.label}</p>
                        </div>
                      </div>
                      <div className='relative'>
                        <button
                          onClick={() => setShowActionsMenu(showActionsMenu === template._id ? null : template._id)}
                          className='p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600'
                        >
                          <HiDotsVertical className='w-5 h-5' />
                        </button>
                        {showActionsMenu === template._id && (
                          <div className='absolute right-0 top-full mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-10'>
                            <button
                              onClick={() => { setEditingTemplate(template); setShowTemplateModal(true); setShowActionsMenu(null); }}
                              className='w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2'
                            >
                              <HiPencil className='w-4 h-4' />
                              Edit
                            </button>
                            <button
                              onClick={() => handleDuplicateTemplate(template)}
                              className='w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2'
                            >
                              <HiDuplicate className='w-4 h-4' />
                              Duplicate
                            </button>
                            <button
                              onClick={() => handleDeleteTemplate(template._id)}
                              className='w-full text-left px-3 py-2 text-sm hover:bg-rose-50 text-rose-600 flex items-center gap-2'
                            >
                              <HiTrash className='w-4 h-4' />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className='flex items-center gap-4 text-xs text-slate-500'>
                      <span className='flex items-center gap-1'>
                        <HiCalendar className='w-3.5 h-3.5' />
                        Created {new Date(template.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className='flex items-center gap-1'>
                        <HiClipboardList className='w-3.5 h-3.5' />
                        Used {template.usageCount} times
                      </span>
                    </div>
                    <div className='mt-3 pt-3 border-t border-slate-200 flex items-center gap-2'>
                      <button
                        onClick={() => { setShowGenerateModal(true); }}
                        className='flex-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors'
                      >
                        Use Template
                      </button>
                      <button className='p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100'>
                        <HiEye className='w-4 h-4' />
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredTemplates.length === 0 && (
                <div className='col-span-full py-12 text-center'>
                  <HiTemplate className='w-12 h-12 text-slate-300 mx-auto mb-3' />
                  <p className='text-sm text-slate-500'>No templates found</p>
                  <button
                    onClick={() => { setEditingTemplate(null); setShowTemplateModal(true); }}
                    className='mt-3 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800'
                  >
                    Create your first template
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Generated Reports Tab */}
        {activeTab === 'generated' && (
          <div className='overflow-x-auto'>
            <table className='w-full'>
              <thead className='bg-slate-50'>
                <tr>
                  <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>Report</th>
                  <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>Client</th>
                  <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>Property/Subject</th>
                  <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>Generated</th>
                  <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>Status</th>
                  <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>Actions</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-slate-100'>
                {filteredReports.map((report) => (
                  <tr key={report._id} className='hover:bg-slate-50'>
                    <td className='px-4 py-3'>
                      <div className='flex items-center gap-2'>
                        <div className='w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center'>
                          <HiDocumentText className='w-4 h-4 text-slate-500' />
                        </div>
                        <span className='text-sm font-medium text-slate-900'>{report.templateName}</span>
                      </div>
                    </td>
                    <td className='px-4 py-3'>
                      <span className='text-sm text-slate-700'>{report.clientName}</span>
                    </td>
                    <td className='px-4 py-3'>
                      <span className='text-sm text-slate-600'>{report.propertyName}</span>
                    </td>
                    <td className='px-4 py-3'>
                      <span className='text-sm text-slate-500'>
                        {new Date(report.generatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </td>
                    <td className='px-4 py-3'>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        report.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {report.status}
                      </span>
                    </td>
                    <td className='px-4 py-3'>
                      <div className='flex items-center gap-1'>
                        <button className='p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600' title='View'>
                          <HiEye className='w-4 h-4' />
                        </button>
                        <button className='p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600' title='Download'>
                          <HiDownload className='w-4 h-4' />
                        </button>
                        <button className='p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600' title='Send'>
                          <HiMail className='w-4 h-4' />
                        </button>
                        <button className='p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600' title='Print'>
                          <HiPrinter className='w-4 h-4' />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredReports.length === 0 && (
                  <tr>
                    <td colSpan={6} className='px-4 py-12 text-center'>
                      <HiDocumentText className='w-12 h-12 text-slate-300 mx-auto mb-3' />
                      <p className='text-sm text-slate-500'>No reports generated yet</p>
                      <button
                        onClick={() => setShowGenerateModal(true)}
                        className='mt-3 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800'
                      >
                        Generate your first report
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <TemplateModal
        isOpen={showTemplateModal}
        onClose={() => { setShowTemplateModal(false); setEditingTemplate(null); }}
        template={editingTemplate}
        onSave={handleSaveTemplate}
      />
      <GenerateReportModal
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        templates={templates}
        onGenerate={handleGenerateReport}
      />
    </div>
  );
}
