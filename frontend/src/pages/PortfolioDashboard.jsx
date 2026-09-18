import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { apiClient, normalizeImageUrl } from '../utils/http';
import { formatDate, formatListingPrice, formatNumber, isPlaceholderPrice } from '../utils/currency';
import { useNotification } from '../contexts/NotificationContext';
import { toCsv, downloadTextFile } from '../utils/spreadsheet';
import { KpiCard } from '../design-system';
import {
  HiRefresh, HiTrendingUp, HiHome, HiCurrencyDollar,
  HiChartBar, HiLocationMarker, HiEye, HiFilter,
  HiChevronDown, HiDownload, HiPrinter, HiOutlinePhotograph,
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const STATUS_COLORS = {
  available: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  under_negotiation: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  sold: { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  rented: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
};

const PROPERTY_TYPES = ['All', 'Residential', 'Commercial', 'Land', 'Industrial'];

export default function PortfolioDashboard() {
  const { t } = useTranslation();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();
  const { showError } = useNotification();

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedType, setSelectedType] = useState('All');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);


  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  const fetchData = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);
    try {
      const propertiesRes = await apiClient.get('/listing/get?limit=100');
      // Handle the nested response structure: { data: { listings: [...] } } or { listings: [...] } or direct array
      const listingsData = propertiesRes?.data?.listings || propertiesRes?.listings || propertiesRes || [];
      setProperties(Array.isArray(listingsData) ? listingsData : []);
    } catch (err) {
      console.error('Portfolio fetch error:', err);
      setError('Failed to load portfolio data');
    } finally {
      setLoading(false);
    }
  }, [canAccess]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fmt = formatNumber;
  const fmtCurrency = formatListingPrice;

  // Calculate portfolio metrics
  const portfolioMetrics = useMemo(() => {
    if (!properties.length) return { totalValue: 0, avgPrice: 0, byStatus: {}, byType: {}, byCity: {} };

    const pricedProperties = properties.filter((p) => !isPlaceholderPrice(p.regularPrice));
    const totalValue = pricedProperties.reduce((sum, p) => sum + (p.regularPrice || 0), 0);
    const avgPrice = pricedProperties.length ? totalValue / pricedProperties.length : 0;
    
    const byStatus = properties.reduce((acc, p) => {
      const status = p.status || 'available';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const byType = properties.reduce((acc, p) => {
      const type = p.type || 'other';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const byCity = properties.reduce((acc, p) => {
      const city = p.city || 'Unknown';
      acc[city] = (acc[city] || 0) + 1;
      return acc;
    }, {});

    return { totalValue, avgPrice, byStatus, byType, byCity };
  }, [properties]);

  // Filter properties
  const filteredProperties = useMemo(() => {
    let filtered = [...properties];
    if (selectedType !== 'All') {
      filtered = filtered.filter(p => (p.type || '').toLowerCase() === selectedType.toLowerCase());
    }
    return filtered.slice(0, 20);
  }, [properties, selectedType]);

  // Top cities
  const topCities = useMemo(() => {
    const cityEntries = Object.entries(portfolioMetrics.byCity);
    return cityEntries.sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [portfolioMetrics.byCity]);

  /**
   * Export the portfolio as CSV.
   *
   * Goes through the shared toCsv/downloadTextFile helpers rather than
   * hand-rolling quoting here: they carry the formula-injection guard (property
   * names arrive from outside the agency) and the UTF-8 BOM that stops Excel
   * turning the rupee sign and non-ASCII names into mojibake.
   *
   * Numbers are passed as numbers so they stay summable in the sheet.
   */
  const handleExport = useCallback(() => {
    if (!properties.length) {
      showError('No data to export');
      return;
    }

    const grid = [
      ['Name', 'City', 'Type', 'Price', 'Status', 'Bedrooms', 'Bathrooms', 'Area (sqft)'],
      ...properties.map((p) => [
        p.name || '',
        p.city || '',
        p.type || '',
        p.regularPrice || 0,
        p.status || 'available',
        p.bedrooms || 0,
        p.bathrooms || 0,
        p.areaSqFt || 0,
      ]),
    ];

    downloadTextFile(`portfolio-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(grid));
  }, [properties, showError]);

  // Print functionality
  const handlePrint = useCallback(() => {
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>{t('portfolioDashboard.portfolioDashboardReport')}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          h1 { color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
          h2 { color: #475569; margin-top: 30px; }
          .summary { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
          .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; min-width: 150px; }
          .stat-label { font-size: 12px; color: #64748b; margin-bottom: 5px; }
          .stat-value { font-size: 24px; font-weight: bold; color: #1e293b; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
          th { background: #f1f5f9; font-weight: 600; color: #475569; }
          tr:nth-child(even) { background: #f8fafc; }
          .status { padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
          .status-available { background: #d1fae5; color: #065f46; }
          .status-sold { background: #dbeafe; color: #1e40af; }
          .status-rented { background: #ede9fe; color: #5b21b6; }
          .status-under_negotiation { background: #fef3c7; color: #92400e; }
          .footer { margin-top: 30px; font-size: 12px; color: #94a3b8; text-align: center; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>{t('portfolioDashboard.portfolioDashboardReport')}</h1>
        <p style="color: #64748b;">Generated on ${formatDate(new Date(), { day: 'numeric', month: 'long' })}</p>
        
        <div class="summary">
          <div class="stat-card">
            <div class="stat-label">{t('portfolioDashboard.totalProperties')}</div>
            <div class="stat-value">${properties.length}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">{t('portfolioDashboard.portfolioValue')}</div>
            <div class="stat-value">${fmtCurrency(portfolioMetrics.totalValue)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">{t('portfolioDashboard.avgPrice')}</div>
            <div class="stat-value">${fmtCurrency(portfolioMetrics.avgPrice)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">{t('portfolioDashboard.locations')}</div>
            <div class="stat-value">${Object.keys(portfolioMetrics.byCity).length}</div>
          </div>
        </div>

        <h2>{t('portfolioDashboard.propertyStatusBreakdown')}</h2>
        <table>
          <tr><th>{t('portfolioDashboard.status')}</th><th>{t('portfolioDashboard.count')}</th><th>{t('portfolioDashboard.percentage')}</th></tr>
          ${Object.entries(portfolioMetrics.byStatus).map(([status, count]) => `
            <tr>
              <td style="text-transform: capitalize;">${status.replace('_', ' ')}</td>
              <td>${count}</td>
              <td>${properties.length ? Math.round((count / properties.length) * 100) : 0}%</td>
            </tr>
          `).join('')}
        </table>

        <h2>{t('portfolioDashboard.propertiesList')}</h2>
        <table>
          <tr>
            <th>{t('portfolioDashboard.property')}</th>
            <th>{t('portfolioDashboard.location')}</th>
            <th>{t('portfolioDashboard.type')}</th>
            <th>{t('portfolioDashboard.price')}</th>
            <th>{t('portfolioDashboard.status')}</th>
          </tr>
          ${filteredProperties.map((p) => `
            <tr>
              <td>${p.name || '-'}</td>
              <td>${p.city || '-'}</td>
              <td style="text-transform: capitalize;">${p.type || '-'}</td>
              <td>${fmtCurrency(p.regularPrice)}</td>
              <td><span class="status status-${p.status || 'available'}">${(p.status || 'available').replace('_', ' ')}</span></td>
            </tr>
          `).join('')}
        </table>

        <div class="footer">
          <p>{t('portfolioDashboard.realEstateCrmPortfolioReport')}</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.documentElement.innerHTML = printContent;
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  }, [properties, filteredProperties, portfolioMetrics, fmtCurrency]);

  if (!canAccess) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <p className='text-slate-600'>{t('portfolioDashboard.accessDenied')}</p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm overflow-hidden'>
        <div className='absolute inset-0 crm-banner-dots pointer-events-none' aria-hidden='true' />
        <div>
          <p className='text-slate-400 text-xs font-medium uppercase tracking-widest mb-1'>{t('portfolioDashboard.portfolio')}</p>
          <h1 className='text-xl font-bold text-white'>{t('portfolioDashboard.portfolioDashboard')}</h1>
          <p className='text-slate-400 text-sm mt-0.5'>{t('portfolioDashboard.overviewOfYourPropertyPortfolioPerformance')}</p>
        </div>
        <div className='flex items-center gap-2 flex-shrink-0'>
          <button
            onClick={fetchData}
            className='px-3 py-1.5 rounded-lg border border-white/10 bg-white/10 text-white hover:bg-white/20 text-sm font-medium flex items-center gap-1.5 transition-colors'
          >
            <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />{t('portfolioDashboard.refresh')}</button>
          <button
            onClick={handleExport}
            disabled={loading || !properties.length}
            className='px-3 py-1.5 rounded-lg border border-white/10 bg-white/10 text-white hover:bg-white/20 text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
          >
            <HiDownload className='w-4 h-4' />{t('portfolioDashboard.export')}</button>
          <button
            onClick={handlePrint}
            disabled={loading || !properties.length}
            className='px-3 py-1.5 rounded-lg border border-white/10 bg-white/10 text-white hover:bg-white/20 text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
          >
            <HiPrinter className='w-4 h-4' />{t('portfolioDashboard.print')}</button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className='bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center justify-between'>
          <p className='text-rose-700 text-sm'>{error}</p>
          <button onClick={fetchData} className='text-rose-700 hover:underline text-sm font-medium'>{t('portfolioDashboard.retry')}</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className='bg-white border border-slate-200 rounded-xl p-5 animate-pulse'>
              <div className='h-4 bg-slate-200 rounded w-2/3 mb-3'></div>
              <div className='h-8 bg-slate-200 rounded w-1/2 mb-2'></div>
              <div className='h-3 bg-slate-100 rounded w-1/3'></div>
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <>
          {/* KPI Cards */}
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
            <KpiCard
              className='crm-animate-in crm-delay-1'
              title={t('portfolioDashboard.totalProperties')}
              value={fmt(properties.length)}
              icon={HiHome}
              color='blue'
              sub={
                <span className='flex items-center gap-1 text-emerald-600 font-medium'>
                  <HiTrendingUp className='w-3.5 h-3.5' />{t('portfolioDashboard.activePortfolio')}</span>
              }
            />
            <KpiCard
              className='crm-animate-in crm-delay-2'
              title={t('portfolioDashboard.portfolioValue')}
              value={fmtCurrency(portfolioMetrics.totalValue)}
              icon={HiCurrencyDollar}
              color='emerald'
              sub='Total listed value'
            />
            <KpiCard
              className='crm-animate-in crm-delay-3'
              title={t('portfolioDashboard.avgPrice')}
              value={fmtCurrency(portfolioMetrics.avgPrice)}
              icon={HiChartBar}
              color='amber'
              sub='Per property average'
            />
            <KpiCard
              className='crm-animate-in crm-delay-4'
              title={t('portfolioDashboard.locations')}
              value={Object.keys(portfolioMetrics.byCity).length}
              icon={HiLocationMarker}
              color='purple'
              sub='Cities covered'
            />
          </div>

          {/* Status Breakdown & Top Cities */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {/* Status Breakdown */}
            <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
              <h3 className='text-sm font-semibold text-slate-900 mb-4'>{t('portfolioDashboard.propertyStatus')}</h3>
              <div className='space-y-3'>
                {Object.entries(portfolioMetrics.byStatus).map(([status, count]) => {
                  const colors = STATUS_COLORS[status] || STATUS_COLORS.available;
                  const percentage = properties.length ? Math.round((count / properties.length) * 100) : 0;
                  return (
                    <div key={status} className='flex items-center gap-3'>
                      <div className={`w-3 h-3 rounded-full ${colors.dot}`} />
                      <span className='text-sm text-slate-700 capitalize flex-1'>{status.replace('_', ' ')}</span>
                      <span className='text-sm font-semibold text-slate-900'>{count}</span>
                      <div className='w-24 bg-slate-100 rounded-full h-2'>
                        <div className={`h-2 rounded-full ${colors.dot}`} style={{ width: `${percentage}%` }} />
                      </div>
                      <span className='text-xs text-slate-500 w-10 text-right'>{percentage}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Cities */}
            <div className='bg-white border border-slate-200 rounded-xl p-5 shadow-sm'>
              <h3 className='text-sm font-semibold text-slate-900 mb-4'>{t('portfolioDashboard.topLocations')}</h3>
              <div className='space-y-3'>
                {topCities.map(([city, count], index) => {
                  const maxCount = topCities[0]?.[1] || 1;
                  const percentage = Math.round((count / maxCount) * 100);
                  return (
                    <div key={city} className='flex items-center gap-3'>
                      <span className='w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-600'>
                        {index + 1}
                      </span>
                      <span className='text-sm text-slate-700 flex-1'>{city}</span>
                      <span className='text-sm font-semibold text-slate-900'>{count}</span>
                      <div className='w-24 bg-slate-100 rounded-full h-2'>
                        <div className='h-2 rounded-full bg-slate-700' style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  );
                })}
                {topCities.length === 0 && (
                  <p className='text-sm text-slate-500'>{t('portfolioDashboard.noLocationDataAvailable')}</p>
                )}
              </div>
            </div>
          </div>

          {/* Property Type Filter & List */}
          <div className='bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm'>
            <div className='p-4 border-b border-slate-200 flex items-center justify-between'>
              <h3 className='text-sm font-semibold text-slate-900'>{t('portfolioDashboard.properties')}</h3>
              <div className='flex items-center gap-2'>
                <div className='relative'>
                  <button
                    onClick={() => setShowTypeDropdown(!showTypeDropdown)}
                    className='px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 flex items-center gap-2 hover:bg-slate-50'
                  >
                    <HiFilter className='w-4 h-4' />
                    {selectedType}
                    <HiChevronDown className='w-4 h-4' />
                  </button>
                  {showTypeDropdown && (
                    <div className='absolute right-0 top-full mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-10'>
                      {PROPERTY_TYPES.map((type) => (
                        <button
                          key={type}
                          onClick={() => { setSelectedType(type); setShowTypeDropdown(false); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${selectedType === type ? 'bg-slate-100 font-medium' : ''}`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className='overflow-x-auto'>
              <table className='w-full'>
                <thead className='bg-slate-50'>
                  <tr>
                    <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>{t('portfolioDashboard.property')}</th>
                    <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>{t('portfolioDashboard.location')}</th>
                    <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>{t('portfolioDashboard.type')}</th>
                    <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>{t('portfolioDashboard.price')}</th>
                    <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>{t('portfolioDashboard.status')}</th>
                    <th className='text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase'>{t('portfolioDashboard.actions')}</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-slate-100'>
                  {filteredProperties.map((property) => {
                    const statusColors = STATUS_COLORS[property.status] || STATUS_COLORS.available;
                    return (
                      <tr key={property._id} className='hover:bg-slate-50'>
                        <td className='px-4 py-3'>
                          <div className='flex items-center gap-3'>
                            {property.imageUrls?.[0] ? (
                              <img
                                src={normalizeImageUrl(property.imageUrls[0])}
                                alt={property.name}
                                className='w-10 h-10 rounded-lg object-cover flex-shrink-0'
                                onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
                              />
                            ) : null}
                            <div
                              className={`w-10 h-10 rounded-lg bg-slate-100 items-center justify-center flex-shrink-0 ${property.imageUrls?.[0] ? 'hidden' : 'flex'}`}
                            >
                              <HiOutlinePhotograph className='w-5 h-5 text-slate-300' />
                            </div>
                            <div>
                              <p className='text-sm font-medium text-slate-900 truncate max-w-[200px]'>{property.name}</p>
                              <p className='text-xs text-slate-500'>{property.bedrooms || 0} bed • {property.bathrooms || 0} bath</p>
                            </div>
                          </div>
                        </td>
                        <td className='px-4 py-3'>
                          <p className='text-sm text-slate-700'>{property.city || '-'}</p>
                        </td>
                        <td className='px-4 py-3'>
                          <span className='text-sm text-slate-600 capitalize'>{property.type || '-'}</span>
                        </td>
                        <td className='px-4 py-3'>
                          <p className='text-sm font-semibold text-slate-900'>{fmtCurrency(property.regularPrice)}</p>
                        </td>
                        <td className='px-4 py-3'>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColors.bg} ${statusColors.text}`}>
                            {(property.status || 'available').replace('_', ' ')}
                          </span>
                        </td>
                        <td className='px-4 py-3'>
                          <Link
                            to={`/listing/${property._id}`}
                            className='text-slate-400 hover:text-slate-600 transition-colors'
                          >
                            <HiEye className='w-5 h-5' />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredProperties.length === 0 && (
                    <tr>
                      <td colSpan={6} className='px-4 py-8 text-center text-sm text-slate-500'>{t('portfolioDashboard.noPropertiesFound')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
