import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { useSelector } from 'react-redux';
import { useBuyerView } from '../contexts/BuyerViewContext';
import { apiClient, normalizeImageUrl } from '../utils/http';
import {
  HiRefresh, HiPlus, HiSearch, HiX,
  HiDocumentText, HiDownload, HiPrinter, HiMail, HiEye,
  HiPencil, HiTrash, HiDotsVertical, HiTemplate, HiDuplicate,
  HiCalendar, HiUser, HiClipboardList, HiCurrencyDollar,
  HiHome, HiChartBar, HiCheckCircle,
  HiClock, HiExclamationCircle,
} from 'react-icons/hi';

const REPORT_TYPES = [
  { id: 'property_summary',   label: 'Property Summary',    Component: HiHome,          color: 'text-blue-600 bg-blue-50',    border: 'border-blue-200',    accent: '#2563eb', description: 'Overview of property details and status' },
  { id: 'market_analysis',    label: 'Market Analysis',     Component: HiChartBar,      color: 'text-emerald-600 bg-emerald-50', border: 'border-emerald-200', accent: '#059669', description: 'Comparative market analysis report' },
  { id: 'investment_report',  label: 'Investment Report',   Component: HiCurrencyDollar,color: 'text-amber-600 bg-amber-50',  border: 'border-amber-200',   accent: '#d97706', description: 'ROI and investment potential analysis' },
  { id: 'transaction_history',label: 'Transaction History', Component: HiClipboardList, color: 'text-purple-600 bg-purple-50',border: 'border-purple-200',  accent: '#7c3aed', description: 'Complete transaction records' },
  { id: 'client_portfolio',   label: 'Client Portfolio',    Component: HiUser,          color: 'text-rose-600 bg-rose-50',    border: 'border-rose-200',    accent: '#e11d48', description: 'Client property holdings summary' },
  { id: 'monthly_summary',    label: 'Monthly Summary',     Component: HiCalendar,      color: 'text-indigo-600 bg-indigo-50',border: 'border-indigo-200',  accent: '#4f46e5', description: 'Monthly activity and performance report' },
];

// ── Default starter templates ─────────────────────────────────────────────────
const DEFAULT_TEMPLATES = [
  {
    name: "Buyer's Property Brief",
    type: 'property_summary',
    description: 'A concise snapshot for buyer presentations — covers property specs, pricing, and photos.',
    sections: ['Property Details', 'Pricing History', 'Photos Gallery'],
  },
  {
    name: 'Full Due Diligence Report',
    type: 'property_summary',
    description: 'Comprehensive report for serious buyers covering every dimension of the property.',
    sections: ['Property Details', 'Pricing History', 'Market Comparison', 'Location Analysis', 'Investment Metrics', 'Photos Gallery'],
  },
  {
    name: 'Investment Analysis Report',
    type: 'investment_report',
    description: 'Deep-dive into ROI, yield estimates, and acquisition metrics for investor clients.',
    sections: ['Property Details', 'Investment Metrics', 'Pricing History', 'Location Analysis'],
  },
  {
    name: 'Market Positioning Brief',
    type: 'market_analysis',
    description: "Helps sellers understand how their property is priced relative to the micro-market.",
    sections: ['Market Comparison', 'Pricing History', 'Location Analysis'],
  },
  {
    name: 'Location & Connectivity Report',
    type: 'market_analysis',
    description: 'Focused on location advantages, area analysis, and market context for the subject property.',
    sections: ['Location Analysis', 'Property Details', 'Market Comparison'],
  },
  {
    name: 'Executive Property Summary',
    type: 'client_portfolio',
    description: 'High-level one-pager for HNI clients — pricing, metrics, and gallery in a clean layout.',
    sections: ['Property Details', 'Pricing History', 'Investment Metrics', 'Photos Gallery'],
  },
];

function buildReportHtml({ template, clientName, propertyName, notes, agentName, reportDate, listing }) {
  const typeInfo  = REPORT_TYPES.find(t => t.id === template.type) || REPORT_TYPES[0];
  const accent    = typeInfo.accent || '#2563eb';
  const fmtCurrency = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
  const fmt         = (n) => new Intl.NumberFormat('en-IN').format(n || 0);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const badge = (text, color) =>
    `<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.4px;background:${color}20;color:${color};border:1px solid ${color}40;">${text}</span>`;

  const row = (label, value, isAlt) => {
    if (!value && value !== 0) return '';
    return `<tr style="background:${isAlt ? '#f8fafc' : '#fff'};">
      <td style="padding:10px 16px;color:#64748b;font-size:13px;width:42%;border-bottom:1px solid #f1f5f9;font-weight:500;">${label}</td>
      <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #f1f5f9;">${value}</td>
    </tr>`;
  };

  const metricCard = (label, value, sub, color) =>
    `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;border-top:3px solid ${color};">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:6px;">${label}</div>
      <div style="font-size:22px;font-weight:800;color:#0f172a;margin-bottom:3px;">${value}</div>
      ${sub ? `<div style="font-size:12px;color:#64748b;">${sub}</div>` : ''}
    </div>`;

  const sectionWrap = (title, icon, content) =>
    `<div style="padding:32px 44px;border-bottom:1px solid #f1f5f9;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
        <div style="width:28px;height:28px;border-radius:7px;background:${accent}15;border:1px solid ${accent}30;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">${icon}</div>
        <h2 style="font-size:15px;font-weight:700;color:#0f172a;margin:0;">${title}</h2>
        <div style="flex:1;height:1px;background:linear-gradient(to right,${accent}30,transparent);margin-left:8px;"></div>
      </div>
      ${content}
    </div>`;

  // ── Section builders ───────────────────────────────────────────────────────
  function buildPropertyDetails() {
    if (!listing) return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;color:#64748b;font-size:13px;font-style:italic;">Property details for <strong style="color:#0f172a;">${propertyName}</strong> will be provided separately upon request.</div>`;
    const l = listing;
    const statusMap = { available: 'Available', sold: 'Sold', under_negotiation: 'Under Negotiation' };
    const statusColor = { available: '#16a34a', sold: '#dc2626', under_negotiation: '#d97706' };
    const status = l.status || 'available';
    let idx = 0;
    const rows = [
      l.name        ? row('Property Name',    `<strong>${l.name}</strong>`, idx++ % 2) : '',
      l.type        ? row('Property Type',    l.type.charAt(0).toUpperCase() + l.type.slice(1), idx++ % 2) : '',
      l.propertyCategory ? row('Category',   l.propertyCategory.charAt(0).toUpperCase() + l.propertyCategory.slice(1), idx++ % 2) : '',
      row('Status', badge(statusMap[status] || status, statusColor[status] || '#64748b'), idx++ % 2),
      l.bedrooms    ? row('Bedrooms',         `${l.bedrooms} BHK`, idx++ % 2) : '',
      l.bathrooms   ? row('Bathrooms',        l.bathrooms, idx++ % 2) : '',
      l.areaSqFt    ? row('Built-up Area',    `<strong>${fmt(l.areaSqFt)}</strong> sq.ft`, idx++ % 2) : '',
      l.sqYard      ? row('Plot Area',        `<strong>${fmt(l.sqYard)}</strong> sq.yd`, idx++ % 2) : '',
      l.plotSize    ? row('Plot Size',        l.plotSize, idx++ % 2) : '',
      l.areaName    ? row('Society / Area',   l.areaName, idx++ % 2) : '',
      l.floor       ? row('Floor',            l.floor, idx++ % 2) : '',
      l.totalFloors ? row('Total Floors',     l.totalFloors, idx++ % 2) : '',
      l.facing      ? row('Facing',           l.facing, idx++ % 2) : '',
      row('Furnished',    l.furnished  ? badge('Furnished', '#16a34a')  : badge('Unfurnished', '#64748b'), idx++ % 2),
      row('Parking',      l.parking    ? badge('Available', '#2563eb')  : badge('Not Available', '#64748b'), idx++ % 2),
      l.propertyNo  ? row('Property No.',     l.propertyNo, idx++ % 2) : '',
    ].filter(Boolean).join('');
    return `
      <table style="width:100%;border-collapse:collapse;border:1px solid #f1f5f9;border-radius:10px;overflow:hidden;">${rows}</table>
      ${l.description ? `<div style="margin-top:16px;padding:16px;background:#f8fafc;border-left:3px solid ${accent};border-radius:0 8px 8px 0;"><p style="color:#475569;font-size:13px;line-height:1.8;margin:0;">${l.description}</p></div>` : ''}`;
  }

  function buildPricing() {
    if (!listing) return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;color:#64748b;font-size:13px;font-style:italic;">Pricing information will be shared upon request.</div>`;
    const l = listing;
    const saving      = l.offer && l.discountPrice ? l.regularPrice - l.discountPrice : 0;
    const savingPct   = saving > 0 ? Math.round((saving / l.regularPrice) * 100) : 0;
    const pricePerSqFt = l.areaSqFt ? Math.round(l.regularPrice / l.areaSqFt) : 0;
    const effectivePrice = l.offer && l.discountPrice ? l.discountPrice : l.regularPrice;
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr${l.offer && l.discountPrice ? ' 1fr' : ''};gap:12px;margin-bottom:20px;">
        <div style="background:linear-gradient(135deg,${accent}08,${accent}15);border:1px solid ${accent}25;border-radius:12px;padding:18px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:${accent};margin-bottom:6px;">Listed Price</div>
          <div style="font-size:24px;font-weight:900;color:#0f172a;">${fmtCurrency(l.regularPrice)}</div>
          ${pricePerSqFt ? `<div style="font-size:12px;color:#64748b;margin-top:4px;">${fmtCurrency(pricePerSqFt)} / sq.ft</div>` : ''}
        </div>
        ${l.offer && l.discountPrice ? `
        <div style="background:linear-gradient(135deg,#f0fdf415,#dcfce7);border:1px solid #bbf7d0;border-radius:12px;padding:18px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#16a34a;margin-bottom:6px;">Negotiated Price</div>
          <div style="font-size:24px;font-weight:900;color:#15803d;">${fmtCurrency(l.discountPrice)}</div>
          ${saving > 0 ? `<div style="font-size:12px;color:#16a34a;margin-top:4px;font-weight:600;">Saving ${fmtCurrency(saving)} (${savingPct}% off)</div>` : ''}
        </div>` : ''}
        ${pricePerSqFt ? `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#64748b;margin-bottom:6px;">Rate / sq.ft</div>
          <div style="font-size:24px;font-weight:900;color:#0f172a;">${fmtCurrency(pricePerSqFt)}</div>
          ${l.areaSqFt ? `<div style="font-size:12px;color:#64748b;margin-top:4px;">${fmt(l.areaSqFt)} sq.ft total</div>` : ''}
        </div>` : ''}
      </div>
      ${l.sqYardRate || l.totalValue ? `
      <table style="width:100%;border-collapse:collapse;border:1px solid #f1f5f9;border-radius:10px;overflow:hidden;">
        ${l.sqYardRate  ? row('Rate per sq.yd', fmtCurrency(l.sqYardRate), false) : ''}
        ${l.totalValue  ? row('Total Value',    `<strong>${fmtCurrency(l.totalValue)}</strong>`, true) : ''}
      </table>` : ''}
      ${l.offer ? `<div style="margin-top:14px;padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:13px;color:#15803d;font-weight:600;">Special offer pricing applies to this property. Subject to negotiation.</div>` : ''}`;
  }

  function buildMarketComparison() {
    if (!listing) return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;color:#64748b;font-size:13px;font-style:italic;">Comparative market analysis based on similar properties in the area.</div>`;
    const l = listing;
    const pricePerSqFt = l.areaSqFt ? Math.round(l.regularPrice / l.areaSqFt) : 0;
    const location = [l.locality, l.city].filter(Boolean).join(', ') || 'the subject area';
    return `
      <div style="padding:16px 20px;background:linear-gradient(to right,${accent}08,transparent);border-left:3px solid ${accent};border-radius:0 8px 8px 0;margin-bottom:20px;">
        <p style="color:#334155;font-size:13.5px;line-height:1.8;margin:0;">
          This <strong>${l.type || 'property'}</strong> in <strong>${location}</strong> is${pricePerSqFt ? ` priced at <strong>${fmtCurrency(pricePerSqFt)} per sq.ft</strong>,` : ''} positioned competitively within the micro-market. ${l.furnished ? 'The property is fully furnished, adding value beyond the base price.' : ''} ${l.parking ? 'Dedicated parking is available.' : ''}
        </p>
      </div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #f1f5f9;border-radius:10px;overflow:hidden;">
        ${row('Subject Property', `<strong>${l.name}</strong>`, false)}
        ${row('Location', [l.locality, l.city, l.state].filter(Boolean).join(', '), true)}
        ${row('Listed Price', fmtCurrency(l.regularPrice), false)}
        ${pricePerSqFt ? row('Price per sq.ft', `<strong>${fmtCurrency(pricePerSqFt)}</strong>`, true) : ''}
        ${row('Parking', l.parking ? badge('Available', '#2563eb') : badge('Not Available', '#64748b'), false)}
        ${row('Furnishing', l.furnished ? badge('Furnished', '#16a34a') : badge('Unfurnished', '#64748b'), true)}
        ${l.areaSqFt ? row('Built-up Area', `${fmt(l.areaSqFt)} sq.ft`, false) : ''}
      </table>
      <p style="margin-top:12px;font-size:12px;color:#94a3b8;font-style:italic;">* A detailed CMA with 3–5 comparable sales is available on request.</p>`;
  }

  function buildLocation() {
    if (!listing) return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;color:#64748b;font-size:13px;font-style:italic;">Location details and connectivity analysis will be provided separately.</div>`;
    const l = listing;
    const parts = [l.address, l.areaName, l.locality, l.city, l.state, l.pincode].filter(Boolean);
    const fullAddress = parts.join(', ');
    let idx = 0;
    const rows = [
      l.address    ? row('Street Address',  l.address,   idx++ % 2) : '',
      l.areaName   ? row('Society / Area',  l.areaName,  idx++ % 2) : '',
      l.locality   ? row('Locality',        l.locality,  idx++ % 2) : '',
      l.city       ? row('City',            `<strong>${l.city}</strong>`, idx++ % 2) : '',
      l.state      ? row('State',           l.state,     idx++ % 2) : '',
      l.pincode    ? row('Pincode',         l.pincode,   idx++ % 2) : '',
      l.location?.lat && l.location?.lng
        ? row('GPS Coordinates', `${l.location.lat.toFixed(5)}, ${l.location.lng.toFixed(5)}`, idx++ % 2) : '',
    ].filter(Boolean).join('');
    return `
      ${fullAddress ? `<div style="padding:14px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:16px;display:flex;align-items:flex-start;gap:12px;">
        <div style="width:32px;height:32px;border-radius:8px;background:${accent};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;">📍</div>
        <div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;margin-bottom:4px;">Full Address</div><div style="font-size:13px;color:#0f172a;font-weight:600;line-height:1.6;">${fullAddress}</div></div>
      </div>` : ''}
      ${rows ? `<table style="width:100%;border-collapse:collapse;border:1px solid #f1f5f9;border-radius:10px;overflow:hidden;">${rows}</table>` : ''}`;
  }

  function buildInvestmentMetrics() {
    if (!listing) return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;color:#64748b;font-size:13px;font-style:italic;">Investment metrics and yield analysis will be provided upon request.</div>`;
    const l = listing;
    const acqPrice     = l.offer && l.discountPrice ? l.discountPrice : l.regularPrice;
    const saving       = l.offer && l.discountPrice ? l.regularPrice - l.discountPrice : 0;
    const pricePerSqFt = l.areaSqFt ? Math.round(acqPrice / l.areaSqFt) : 0;
    const monthlyRent  = acqPrice ? Math.round((acqPrice * 0.03) / 12) : 0;
    const annualRent   = monthlyRent * 12;
    const grossYield   = acqPrice ? ((annualRent / acqPrice) * 100).toFixed(2) : '0.00';
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
        ${metricCard('Acquisition Price', fmtCurrency(acqPrice), saving > 0 ? `Saving ${fmtCurrency(saving)} vs listed` : 'Best available price', accent)}
        ${pricePerSqFt ? metricCard('Cost per sq.ft', fmtCurrency(pricePerSqFt), l.areaSqFt ? `${fmt(l.areaSqFt)} sq.ft built-up` : '', '#7c3aed') : ''}
        ${monthlyRent ? metricCard('Est. Monthly Rent', fmtCurrency(monthlyRent), 'Based on ~3% annual yield', '#16a34a') : ''}
        ${annualRent ? metricCard('Gross Rental Yield', `${grossYield}%`, `${fmtCurrency(annualRent)} / year est.`, '#d97706') : ''}
      </div>
      <div style="padding:12px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#92400e;line-height:1.6;">
        <strong>Note:</strong> Rental yield estimates are indicative and based on prevailing market averages (~3% gross annual yield). Actual rental income, appreciation, and total returns depend on location, demand, property condition, and market cycles. This is not financial advice.
      </div>`;
  }

  function buildPhotos() {
    if (!listing?.imageUrls?.length) return `<div style="padding:32px;text-align:center;background:#f8fafc;border:2px dashed #e2e8f0;border-radius:10px;color:#94a3b8;font-size:13px;">Property photos are available upon request or will be shared via a secure link.</div>`;
    const imgs = listing.imageUrls.slice(0, 6);
    const hero = imgs[0];
    const rest = imgs.slice(1, 5);
    const heroSrc = normalizeImageUrl(hero) || hero;
    const heroHtml = `<img src="${heroSrc}" alt="Property" style="width:100%;height:280px;object-fit:cover;border-radius:10px;display:block;margin-bottom:10px;" />`;
    const gridHtml = rest.length
      ? `<div style="display:grid;grid-template-columns:repeat(${Math.min(rest.length, 4)},1fr);gap:10px;">
          ${rest.map(url => { const src = normalizeImageUrl(url) || url; return `<img src="${src}" alt="Property" style="width:100%;height:120px;object-fit:cover;border-radius:8px;display:block;" />`; }).join('')}
        </div>`
      : '';
    return heroHtml + gridHtml + (imgs.length > 5 ? `<p style="margin-top:10px;font-size:12px;color:#94a3b8;text-align:right;">+${listing.imageUrls.length - 5} more photos available on request</p>` : '');
  }

  // ── Section icons ──────────────────────────────────────────────────────────
  const SECTION_ICONS = {
    'Property Details':   '🏠',
    'Pricing History':    '💰',
    'Market Comparison':  '📊',
    'Location Analysis':  '📍',
    'Investment Metrics': '📈',
    'Photos Gallery':     '🖼',
  };
  const SECTION_BUILDERS = {
    'Property Details':   buildPropertyDetails,
    'Pricing History':    buildPricing,
    'Market Comparison':  buildMarketComparison,
    'Location Analysis':  buildLocation,
    'Investment Metrics': buildInvestmentMetrics,
    'Photos Gallery':     buildPhotos,
  };

  const sectionsHtml = (template.sections || [])
    .map(s => sectionWrap(s, SECTION_ICONS[s] || '📄', (SECTION_BUILDERS[s] || (() => `<div style="color:#64748b;font-size:13px;font-style:italic;">Details for ${s} will be provided separately.</div>`))()))
    .join('');

  const notesHtml = notes
    ? `<div style="padding:32px 44px;border-bottom:1px solid #f1f5f9;">
        <div style="padding:18px 20px;background:#fefce8;border:1px solid #fde047;border-left:4px solid #eab308;border-radius:0 10px 10px 0;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#a16207;margin-bottom:8px;">Agent Notes</div>
          <p style="color:#713f12;margin:0;font-size:13.5px;line-height:1.8;">${notes}</p>
        </div>
      </div>`
    : '';

  // ── Listing quick-stats for cover ──────────────────────────────────────────
  const quickStats = listing ? [
    listing.regularPrice ? { label: 'Price', value: fmtCurrency(listing.regularPrice) } : null,
    listing.areaSqFt     ? { label: 'Area',  value: `${fmt(listing.areaSqFt)} sq.ft`  } : null,
    listing.type         ? { label: 'Type',  value: listing.type.charAt(0).toUpperCase() + listing.type.slice(1) } : null,
  ].filter(Boolean) : [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${typeInfo.label} — ${propertyName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#f1f5f9;color:#334155;}
    .page{max-width:840px;margin:0 auto;background:#fff;box-shadow:0 4px 40px rgba(0,0,0,.10);}
    p{color:#475569;line-height:1.75;margin-bottom:10px;font-size:13.5px;}
    @media print{
      body{background:#fff;}
      .page{box-shadow:none;max-width:100%;}
      .no-print{display:none!important;}
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ══ COVER ══ -->
  <div style="background:linear-gradient(145deg,#0f172a 0%,#1e3a5f 60%,#0f172a 100%);padding:44px 48px 36px;color:#fff;position:relative;overflow:hidden;">
    <!-- Decorative circles -->
    <div style="position:absolute;top:-60px;right:-60px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,.03);pointer-events:none;"></div>
    <div style="position:absolute;bottom:-40px;left:-40px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.03);pointer-events:none;"></div>

    <!-- Top bar -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:32px;">
      <div style="font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.5);">Real Vista</div>
      <div style="background:${accent};padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px;">${typeInfo.label}</div>
    </div>

    <!-- Property title -->
    <h1 style="font-size:28px;font-weight:900;color:#fff;line-height:1.2;margin-bottom:8px;">${propertyName}</h1>
    <p style="color:rgba(255,255,255,.55);font-size:13px;margin-bottom:${quickStats.length ? '28px' : '0'};">${typeInfo.description}</p>

    <!-- Quick stats strip -->
    ${quickStats.length ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:28px;">
      ${quickStats.map(s => `<div style="padding:6px 14px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:6px;font-size:12px;"><span style="color:rgba(255,255,255,.5);margin-right:6px;">${s.label}</span><strong style="color:#fff;">${s.value}</strong></div>`).join('')}
    </div>` : ''}

    <!-- Meta cards -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
      <div style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:14px 16px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,.45);margin-bottom:5px;">Prepared For</div>
        <div style="font-size:14px;font-weight:700;color:#fff;">${clientName}</div>
      </div>
      <div style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:14px 16px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,.45);margin-bottom:5px;">Prepared By</div>
        <div style="font-size:14px;font-weight:700;color:#fff;">${agentName}</div>
      </div>
      <div style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:14px 16px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,.45);margin-bottom:5px;">Report Date</div>
        <div style="font-size:14px;font-weight:700;color:#fff;">${reportDate}</div>
      </div>
    </div>
  </div>

  <!-- ══ ACCENT STRIPE ══ -->
  <div style="height:4px;background:linear-gradient(to right,${accent},${accent}80,transparent);"></div>

  <!-- ══ SECTIONS ══ -->
  ${sectionsHtml || `<div style="padding:48px;text-align:center;color:#94a3b8;font-style:italic;">No sections selected for this template.</div>`}

  <!-- ══ NOTES ══ -->
  ${notesHtml}

  <!-- ══ DISCLAIMER ══ -->
  <div style="padding:24px 44px;">
    <div style="padding:14px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:11.5px;color:#94a3b8;line-height:1.7;">
      <strong style="color:#64748b;">Disclaimer:</strong> This report is prepared for informational purposes only and is intended solely for the named recipient. Information is based on sources deemed reliable but is not guaranteed. All figures are indicative and subject to change without notice. This document does not constitute a legal offer, binding agreement, or financial advice.
    </div>
  </div>

  <!-- ══ FOOTER ══ -->
  <div style="background:#0f172a;padding:20px 44px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:12px;color:rgba(255,255,255,.5);">Prepared by <strong style="color:rgba(255,255,255,.8);">${agentName}</strong> · Real Vista</div>
    <div style="font-size:11px;color:rgba(255,255,255,.35);">Generated ${reportDate} · Confidential</div>
  </div>

</div>
</body>
</html>`;
}

// ─── Report Preview Modal ────────────────────────────────────────────────────

function ReportPreviewModal({ isOpen, onClose, report, onSend }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    if (isOpen && iframeRef.current && report?.html) {
      const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
      if (doc) { doc.open(); doc.write(report.html); doc.close(); }
    }
    if (!isOpen) { setSent(false); setSending(false); }
  }, [isOpen, report]);

  const handlePrint = () => { if (iframeRef.current) iframeRef.current.contentWindow.print(); };

  const handleDownload = () => {
    const blob = new Blob([report.html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${(report.propertyName || 'property').replace(/\s+/g, '_')}_${(report.reportDate || report.generatedAt || '').replace(/\s/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSend = async () => {
    setSending(true);
    try { await onSend(report); setSent(true); } catch (_) {}
    setSending(false);
  };

  if (!isOpen || !report) return null;

  return (
    <div className='fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col'>
      <div className='flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0'>
        <div>
          <h2 className='text-sm font-semibold text-slate-900'>Report Preview</h2>
          <p className='text-xs text-slate-500'>{report.templateName} · {report.clientName} · {report.propertyName}</p>
        </div>
        <div className='flex items-center gap-2'>
          {report.clientEmail && (
            <button
              onClick={handleSend}
              disabled={sending || sent}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                sent ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60'
              }`}
            >
              <HiMail className='w-4 h-4' />
              {sent ? 'Sent!' : sending ? 'Sending...' : `Email to ${report.clientEmail}`}
            </button>
          )}
          <button onClick={handleDownload} className='px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium flex items-center gap-1.5'>
            <HiDownload className='w-4 h-4' />
            Download
          </button>
          <button onClick={handlePrint} className='px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium flex items-center gap-1.5'>
            <HiPrinter className='w-4 h-4' />
            Print / PDF
          </button>
          <button onClick={onClose} className='p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100'>
            <HiX className='w-5 h-5' />
          </button>
        </div>
      </div>
      <div className='flex-1 bg-slate-200 overflow-auto p-4'>
        <iframe
          ref={iframeRef}
          title='Report Preview'
          className='w-full h-full bg-white rounded-lg shadow-lg mx-auto'
          style={{ maxWidth: 900, display: 'block', minHeight: 600 }}
        />
      </div>
    </div>
  );
}

// ─── Template Modal ──────────────────────────────────────────────────────────

function TemplateModal({ isOpen, onClose, template, onSave }) {
  const [formData, setFormData] = useState({ name: '', type: 'property_summary', description: '', sections: [] });

  useEffect(() => {
    if (template) {
      setFormData({ name: template.name || '', type: template.type || 'property_summary', description: template.description || '', sections: template.sections || [] });
    } else {
      setFormData({ name: '', type: 'property_summary', description: '', sections: [] });
    }
  }, [template, isOpen]);

  const handleSubmit = (e) => { e.preventDefault(); onSave(formData); onClose(); };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto'>
      <div className='flex items-start justify-center min-h-full p-4'>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-lg my-auto'>
        <div className='p-4 border-b border-slate-200 flex items-center justify-between'>
          <h2 className='text-lg font-semibold text-slate-900'>{template ? 'Edit Template' : 'Create New Template'}</h2>
          <button onClick={onClose} className='p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100'><HiX className='w-5 h-5' /></button>
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
              {REPORT_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
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
                      if (e.target.checked) setFormData({ ...formData, sections: [...formData.sections, section] });
                      else setFormData({ ...formData, sections: formData.sections.filter(s => s !== section) });
                    }}
                    className='w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900'
                  />
                  <span className='text-sm text-slate-700'>{section}</span>
                </label>
              ))}
            </div>
          </div>
          <div className='flex justify-end gap-2 pt-2'>
            <button type='button' onClick={onClose} className='px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium'>Cancel</button>
            <button type='submit' className='px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-medium'>
              {template ? 'Update' : 'Create'} Template
            </button>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}

// ─── Generate / Edit Report Modal ────────────────────────────────────────────

function GenerateReportModal({ isOpen, onClose, templates, onGenerate, editingReport, preselectedTemplateId, onInstallTemplates }) {
  const empty = { templateId: '', clientId: '', clientName: '', clientEmail: '', propertyName: '', notes: '', listing: null };
  const [formData, setFormData] = useState(empty);
  const [clients, setClients] = useState([]);
  const [listings, setListings] = useState([]);
  const [listingSearch, setListingSearch] = useState('');
  const [showListingDropdown, setShowListingDropdown] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingListings, setLoadingListings] = useState(false);
  const [installing, setInstalling] = useState(false);
  const listingRef = useRef(null);
  const isEdit = !!editingReport;

  useEffect(() => {
    if (!isOpen) return;
    setLoadingClients(true);
    setLoadingListings(true);
    apiClient.get('/clients?limit=200')
      .then((res) => setClients(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {})
      .finally(() => setLoadingClients(false));
    apiClient.get('/listing/get?limit=200')
      .then((res) => {
        const data = res?.data?.listings || res?.listings || (Array.isArray(res?.data) ? res.data : null) || [];
        setListings(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => setLoadingListings(false));
  }, [isOpen]);

  // Pre-fill from editingReport or preselectedTemplateId
  useEffect(() => {
    if (isOpen && editingReport) {
      setFormData({
        templateId: editingReport.templateId || '',
        clientId: editingReport.clientId || '',
        clientName: editingReport.clientName || '',
        clientEmail: editingReport.clientEmail || '',
        propertyName: editingReport.propertyName || '',
        notes: editingReport.notes || '',
        listing: null,
      });
      setListingSearch(editingReport.propertyName || '');
    } else if (isOpen) {
      setFormData({ ...empty, templateId: preselectedTemplateId || '' });
      setListingSearch('');
    }
  }, [isOpen, editingReport, preselectedTemplateId]);

  useEffect(() => {
    const handler = (e) => { if (listingRef.current && !listingRef.current.contains(e.target)) setShowListingDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredListings = listings.filter(l =>
    !listingSearch || l.name?.toLowerCase().includes(listingSearch.toLowerCase()) ||
    l.city?.toLowerCase().includes(listingSearch.toLowerCase()) ||
    l.locality?.toLowerCase().includes(listingSearch.toLowerCase())
  );

  const handleClientSelect = (e) => {
    const id = e.target.value;
    const client = clients.find(c => c._id === id);
    setFormData(prev => ({ ...prev, clientId: id, clientName: client?.name || '', clientEmail: client?.email || '' }));
  };

  const handleListingSelect = (listing) => {
    setFormData(prev => ({ ...prev, listing, propertyName: listing.name }));
    setListingSearch(listing.name);
    setShowListingDropdown(false);
  };

  const handleClearListing = () => {
    setFormData(prev => ({ ...prev, listing: null, propertyName: '' }));
    setListingSearch('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onGenerate(formData, editingReport?._id);
    onClose();
    setFormData(empty);
    setListingSearch('');
  };

  if (!isOpen) return null;

  const fmtCurrency = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

  return (
    <div className='fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto'>
      <div className='flex items-start justify-center min-h-full p-4'>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-lg my-auto'>
        <div className='p-4 border-b border-slate-200 flex items-center justify-between'>
          <div>
            <h2 className='text-lg font-semibold text-slate-900'>{isEdit ? 'Edit & Regenerate Report' : 'Generate Report'}</h2>
            {isEdit && <p className='text-xs text-slate-500 mt-0.5'>Changes will update the saved report</p>}
          </div>
          <button onClick={onClose} className='p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100'><HiX className='w-5 h-5' /></button>
        </div>
        <form onSubmit={handleSubmit} className='p-4 space-y-4'>
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Template *</label>
            {templates.length === 0 ? (
              <div className='rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center'>
                <HiTemplate className='w-8 h-8 text-slate-300 mx-auto mb-2' />
                <p className='text-xs font-medium text-slate-600 mb-1'>No templates yet</p>
                <p className='text-xs text-slate-400 mb-3'>Install the 6 professional starter templates to get going instantly.</p>
                <button
                  type='button'
                  disabled={installing}
                  onClick={async () => {
                    setInstalling(true);
                    await onInstallTemplates();
                    setInstalling(false);
                  }}
                  className='px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-60 flex items-center gap-1.5 mx-auto'
                >
                  {installing
                    ? <><div className='w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin' />Installing…</>
                    : <><HiPlus className='w-3.5 h-3.5' />Install 6 Starter Templates</>}
                </button>
              </div>
            ) : (
              <select
                value={formData.templateId}
                onChange={(e) => setFormData({ ...formData, templateId: e.target.value })}
                className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
                required
              >
                <option value=''>Choose a template…</option>
                {templates.map((t) => {
                  const ti = REPORT_TYPES.find(r => r.id === t.type);
                  return <option key={t._id} value={t._id}>{ti ? `[${ti.label}] ` : ''}{t.name}</option>;
                })}
              </select>
            )}
          </div>

          {/* Property picker */}
          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Property Listing</label>
            <div className='relative' ref={listingRef}>
              <div className='flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm focus-within:ring-2 focus-within:ring-slate-900'>
                <HiSearch className='w-4 h-4 text-slate-400 shrink-0' />
                <input
                  type='text'
                  value={listingSearch}
                  onChange={(e) => { setListingSearch(e.target.value); setShowListingDropdown(true); if (!e.target.value) handleClearListing(); }}
                  onFocus={() => setShowListingDropdown(true)}
                  placeholder={loadingListings ? 'Loading listings...' : 'Search by name, city, locality...'}
                  className='flex-1 bg-transparent outline-none text-slate-700 placeholder:text-slate-400'
                />
                {formData.listing && (
                  <button type='button' onClick={handleClearListing} className='text-slate-400 hover:text-slate-600'><HiX className='w-4 h-4' /></button>
                )}
              </div>
              {showListingDropdown && filteredListings.length > 0 && (
                <div className='absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-[60] max-h-52 overflow-y-auto'>
                  {filteredListings.slice(0, 30).map((l) => (
                    <button
                      key={l._id}
                      type='button'
                      onClick={() => handleListingSelect(l)}
                      className='w-full text-left px-3 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0'
                    >
                      <div className='text-sm font-medium text-slate-900 truncate'>{l.name}</div>
                      <div className='text-xs text-slate-500 flex items-center gap-2 mt-0.5'>
                        {[l.locality, l.city].filter(Boolean).join(', ')}
                        {l.regularPrice ? <span className='font-medium text-slate-700'>{fmtCurrency(l.regularPrice)}</span> : null}
                        {l.areaSqFt ? <span>{l.areaSqFt} sq.ft</span> : null}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {formData.listing && (
              <div className='mt-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between'>
                <div>
                  <p className='text-xs font-semibold text-emerald-800'>{formData.listing.name}</p>
                  <p className='text-xs text-emerald-600'>{[formData.listing.locality, formData.listing.city].filter(Boolean).join(', ')} · {fmtCurrency(formData.listing.regularPrice)}</p>
                </div>
                <span className='text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium'>Real data</span>
              </div>
            )}
            {!formData.listing && (
              <p className='text-xs text-slate-500 mt-1'>Or enter a property name manually below.</p>
            )}
          </div>

          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Property / Subject *</label>
            <input
              type='text'
              value={formData.propertyName}
              onChange={(e) => setFormData({ ...formData, propertyName: e.target.value })}
              className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
              placeholder='Property name or report subject'
              required
            />
          </div>

          <div>
            <label className='block text-sm font-medium text-slate-700 mb-1'>Client</label>
            <select
              value={formData.clientId}
              onChange={handleClientSelect}
              className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
              disabled={loadingClients}
            >
              <option value=''>{loadingClients ? 'Loading...' : 'Pick from CRM or fill manually'}</option>
              {clients.map((c) => <option key={c._id} value={c._id}>{c.name}{c.email ? ` — ${c.email}` : ''}</option>)}
            </select>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div>
              <label className='block text-sm font-medium text-slate-700 mb-1'>Client Name *</label>
              <input
                type='text'
                value={formData.clientName}
                onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
                placeholder='Client name'
                required
              />
            </div>
            <div>
              <label className='block text-sm font-medium text-slate-700 mb-1'>Client Email</label>
              <input
                type='email'
                value={formData.clientEmail}
                onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
                className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm'
                placeholder='email@example.com'
              />
            </div>
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

          {!formData.clientEmail && (
            <p className='text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 flex items-center gap-1.5'>
              <HiExclamationCircle className='w-4 h-4 shrink-0' />
              Add a client email to enable sending the report via email.
            </p>
          )}

          <div className='flex justify-end gap-2 pt-2'>
            <button type='button' onClick={onClose} className='px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium'>Cancel</button>
            <button type='submit' className='px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-sm font-medium flex items-center gap-1.5'>
              {isEdit ? <HiRefresh className='w-4 h-4' /> : <HiDocumentText className='w-4 h-4' />}
              {isEdit ? 'Regenerate & Save' : 'Generate Report'}
            </button>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}

// ─── Report Editor Modal ─────────────────────────────────────────────────────

function ReportEditorModal({ isOpen, onClose, report, onSave }) {
  const iframeRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!isOpen || !report?.html) return;
    setDirty(false);
    // Slight delay so the iframe DOM is ready
    const timer = setTimeout(() => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      doc.open();
      doc.write(report.html);
      doc.close();
      doc.designMode = 'on';
      doc.execCommand('styleWithCSS', false, true);
      doc.addEventListener('input', () => setDirty(true));
    }, 60);
    return () => clearTimeout(timer);
  }, [isOpen, report]);

  const exec = (cmd, value = null) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.execCommand(cmd, false, value);
    iframeRef.current.contentWindow.focus();
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const doc = iframeRef.current?.contentDocument;
      const html = doc
        ? `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
        : report.html;
      await onSave(report._id, html);
      setDirty(false);
    } catch (_) {}
    setSaving(false);
  };

  const handleClose = () => {
    if (dirty && !window.confirm('You have unsaved changes. Close anyway?')) return;
    onClose();
  };

  if (!isOpen || !report) return null;

  const Divider = () => <div className='w-px h-5 bg-slate-200 mx-0.5 shrink-0' />;

  const TBtn = ({ onClick, title, children, className = '' }) => (
    <button
      type='button'
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`px-2 py-1 rounded text-sm transition-colors text-slate-600 hover:bg-slate-100 hover:text-slate-900 shrink-0 ${className}`}
    >
      {children}
    </button>
  );

  return (
    <div className='fixed inset-0 z-50 flex flex-col bg-slate-100'>
      {/* ── Top bar ── */}
      <div className='shrink-0 bg-white border-b border-slate-200 shadow-sm'>
        <div className='flex items-center justify-between px-4 py-2.5 border-b border-slate-100'>
          <div className='min-w-0'>
            <h2 className='text-sm font-semibold text-slate-900'>Edit Report</h2>
            <p className='text-xs text-slate-500 truncate'>{report.templateName} · {report.clientName} · {report.propertyName}</p>
          </div>
          <div className='flex items-center gap-2 shrink-0'>
            {dirty && (
              <span className='text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full'>
                Unsaved changes
              </span>
            )}
            <button onClick={handleClose} className='px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium'>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className='px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors'
            >
              <HiCheckCircle className='w-3.5 h-3.5' />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* ── Formatting toolbar ── */}
        <div className='flex items-center gap-0.5 px-3 py-1.5 overflow-x-auto'>
          <TBtn onClick={() => exec('undo')} title='Undo (Ctrl+Z)'>
            <span className='text-xs font-medium'>↩ Undo</span>
          </TBtn>
          <TBtn onClick={() => exec('redo')} title='Redo (Ctrl+Y)'>
            <span className='text-xs font-medium'>↪ Redo</span>
          </TBtn>
          <Divider />
          <TBtn onClick={() => exec('bold')} title='Bold' className='font-bold w-7 text-center'>B</TBtn>
          <TBtn onClick={() => exec('italic')} title='Italic' className='italic w-7 text-center'>I</TBtn>
          <TBtn onClick={() => exec('underline')} title='Underline' className='underline w-7 text-center'>U</TBtn>
          <Divider />
          <TBtn onClick={() => exec('justifyLeft')} title='Align left'>
            <span className='text-xs'>⬛ Left</span>
          </TBtn>
          <TBtn onClick={() => exec('justifyCenter')} title='Center'>
            <span className='text-xs'>⬛ Center</span>
          </TBtn>
          <TBtn onClick={() => exec('justifyRight')} title='Align right'>
            <span className='text-xs'>Right ⬛</span>
          </TBtn>
          <Divider />
          <select
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => { exec('formatBlock', e.target.value); e.target.value = ''; }}
            defaultValue=''
            className='text-xs border border-slate-200 rounded px-1.5 py-1 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-slate-300 shrink-0'
          >
            <option value='' disabled>Format…</option>
            <option value='h1'>Heading 1</option>
            <option value='h2'>Heading 2</option>
            <option value='h3'>Heading 3</option>
            <option value='p'>Paragraph</option>
          </select>
          <select
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => { exec('fontSize', e.target.value); e.target.value = ''; }}
            defaultValue=''
            className='text-xs border border-slate-200 rounded px-1.5 py-1 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-slate-300 ml-1 shrink-0'
          >
            <option value='' disabled>Size…</option>
            <option value='1'>XSmall</option>
            <option value='2'>Small</option>
            <option value='3'>Normal</option>
            <option value='5'>Large</option>
            <option value='7'>XLarge</option>
          </select>
          <Divider />
          <label className='flex items-center gap-1.5 cursor-pointer shrink-0 px-2' title='Text color'>
            <span className='text-xs text-slate-500'>Color</span>
            <input
              type='color'
              defaultValue='#0f172a'
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => exec('foreColor', e.target.value)}
              className='w-5 h-5 rounded cursor-pointer border-0 p-0'
            />
          </label>
          <label className='flex items-center gap-1.5 cursor-pointer shrink-0 px-2' title='Highlight color'>
            <span className='text-xs text-slate-500'>Highlight</span>
            <input
              type='color'
              defaultValue='#fef08a'
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => exec('backColor', e.target.value)}
              className='w-5 h-5 rounded cursor-pointer border-0 p-0'
            />
          </label>
          <Divider />
          <TBtn onClick={() => exec('insertUnorderedList')} title='Bullet list'>
            <span className='text-xs'>• List</span>
          </TBtn>
          <TBtn onClick={() => exec('removeFormat')} title='Clear formatting'>
            <span className='text-xs'>✕ Clear</span>
          </TBtn>
          <div className='ml-auto pl-4 shrink-0'>
            <span className='text-xs text-slate-400 italic'>Click any text in the report to edit it</span>
          </div>
        </div>
      </div>

      {/* ── Editable iframe ── */}
      <div className='flex-1 overflow-auto p-6'>
        <iframe
          ref={iframeRef}
          title='Report Editor'
          className='w-full bg-white rounded-xl shadow-lg mx-auto block'
          style={{ maxWidth: 900, minHeight: 1200 }}
        />
      </div>
    </div>
  );
}

// ─── Template Preview Modal ───────────────────────────────────────────────────

const SAMPLE_LISTING = {
  name: 'Skyline Residency – Apt 4B',
  listingType: 'sale',
  price: 8500000,
  currency: 'INR',
  area: 1450,
  areaUnit: 'sqft',
  bedrooms: 3,
  bathrooms: 2,
  parking: 'Covered',
  furnished: 'Semi-Furnished',
  floor: '4th of 12',
  facing: 'East',
  ageOfProperty: 3,
  possession: 'Ready to Move',
  description: 'A bright, airy 3-BHK in a gated community with 24/7 security, swimming pool, and landscaped gardens. Walking distance to metro station and IT hub.',
  address: { city: 'Bengaluru', state: 'Karnataka' },
  imageUrls: [],
  features: ['Swimming Pool', 'Gym', 'Clubhouse', 'Security', 'Power Backup', 'Lift'],
  priceHistory: [
    { date: '2023-01', price: 7800000 },
    { date: '2024-01', price: 8200000 },
    { date: '2025-01', price: 8500000 },
  ],
};

function TemplatePreviewModal({ isOpen, onClose, template, onEdit, onUse }) {
  const iframeRef = useRef(null);
  const isInstalled = !!template?._id;

  const html = useMemo(() => {
    if (!template) return '';
    return buildReportHtml({
      template,
      clientName: 'Sample Client',
      propertyName: SAMPLE_LISTING.name,
      notes: 'This is a preview using sample data. Real reports will use actual property and client information.',
      agentName: 'Your Name',
      reportDate: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
      listing: SAMPLE_LISTING,
    });
  }, [template]);

  useEffect(() => {
    if (!isOpen || !iframeRef.current || !html) return;
    const doc = iframeRef.current.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
  }, [isOpen, html]);

  if (!isOpen || !template) return null;

  const typeInfo = REPORT_TYPES.find(t => t.id === template.type) || REPORT_TYPES[0];

  return (
    <div className='fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col'>
      {/* Header */}
      <div className='bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shrink-0'>
        <div className={`w-8 h-8 rounded-lg ${typeInfo.color} flex items-center justify-center shrink-0`}>
          <typeInfo.Component className='w-4 h-4' />
        </div>
        <div className='min-w-0 flex-1'>
          <h2 className='text-sm font-semibold text-slate-900 truncate'>{template.name}</h2>
          <p className='text-xs text-slate-500'>{typeInfo.label} · Preview with sample data</p>
        </div>
        <div className='flex items-center gap-2'>
          <span className='text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full font-medium'>
            Sample Data
          </span>
          {isInstalled && onEdit && (
            <button
              onClick={() => { onEdit(template); onClose(); }}
              className='flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50'
            >
              <HiPencil className='w-4 h-4' />
              Edit Template
            </button>
          )}
          {isInstalled && onUse && (
            <button
              onClick={() => { onUse(template._id); onClose(); }}
              className='flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800'
            >
              <HiDocumentText className='w-4 h-4' />
              Use Template
            </button>
          )}
          <button
            onClick={() => {
              const w = window.open('', '_blank');
              w.document.write(html);
              w.document.close();
              w.print();
            }}
            className='p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100'
            title='Print'
          >
            <HiPrinter className='w-5 h-5' />
          </button>
          <button
            onClick={onClose}
            className='p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100'
          >
            <HiX className='w-5 h-5' />
          </button>
        </div>
      </div>
      {/* iframe preview */}
      <div className='flex-1 overflow-hidden bg-slate-200'>
        <iframe
          ref={iframeRef}
          title='Template Preview'
          className='w-full h-full border-0'
          sandbox='allow-same-origin'
        />
      </div>
    </div>
  );
}

// ─── Report Card (Generated Reports tab) ─────────────────────────────────────

function ReportCard({ report, onView, onEdit, onEditContent, onSend, onDelete, typeInfo }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const Icon = typeInfo?.Component || HiDocumentText;
  const colorClasses = typeInfo?.color || 'text-slate-600 bg-slate-100';

  return (
    <div className='bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all flex flex-col gap-3'>
      {/* Header */}
      <div className='flex items-start justify-between gap-2'>
        <div className='flex items-center gap-3 min-w-0'>
          <div className={`w-9 h-9 rounded-xl ${colorClasses} flex items-center justify-center shrink-0`}>
            <Icon className='w-5 h-5' />
          </div>
          <div className='min-w-0'>
            <p className='text-sm font-semibold text-slate-900 truncate'>{report.templateName}</p>
            <p className='text-xs text-slate-500 truncate'>{typeInfo?.label || 'Report'}</p>
          </div>
        </div>
        <div className='flex items-center gap-1.5 shrink-0'>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            report.status === 'sent'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {report.status === 'sent' ? <HiCheckCircle className='w-3 h-3' /> : <HiClock className='w-3 h-3' />}
            {report.status === 'sent' ? 'Sent' : 'Draft'}
          </span>
          <div className='relative' ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className='p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600'
            >
              <HiDotsVertical className='w-4 h-4' />
            </button>
            {menuOpen && (
              <div className='absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-30 py-1'>
                <button onClick={() => { onView(report); setMenuOpen(false); }} className='w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700'>
                  <HiEye className='w-4 h-4' /> Preview
                </button>
                <button onClick={() => { onEditContent(report); setMenuOpen(false); }} className='w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700'>
                  <HiPencil className='w-4 h-4' /> Edit Content
                </button>
                <button onClick={() => { onEdit(report); setMenuOpen(false); }} className='w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700'>
                  <HiRefresh className='w-4 h-4' /> Regenerate
                </button>
                {report.clientEmail && (
                  <button onClick={() => { onSend(report); setMenuOpen(false); }} className='w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700'>
                    <HiMail className='w-4 h-4' /> Send by Email
                  </button>
                )}
                <div className='h-px bg-slate-100 my-1' />
                <button onClick={() => { onDelete(report._id); setMenuOpen(false); }} className='w-full text-left px-3 py-2 text-sm hover:bg-rose-50 flex items-center gap-2 text-rose-600'>
                  <HiTrash className='w-4 h-4' /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className='space-y-1.5'>
        <div className='flex items-center gap-2 text-xs text-slate-600'>
          <HiUser className='w-3.5 h-3.5 text-slate-400 shrink-0' />
          <span className='font-medium truncate'>{report.clientName}</span>
          {report.clientEmail && <span className='text-slate-400 truncate'>· {report.clientEmail}</span>}
        </div>
        <div className='flex items-center gap-2 text-xs text-slate-600'>
          <HiHome className='w-3.5 h-3.5 text-slate-400 shrink-0' />
          <span className='truncate'>{report.propertyName}</span>
        </div>
        <div className='flex items-center gap-2 text-xs text-slate-500'>
          <HiCalendar className='w-3.5 h-3.5 text-slate-400 shrink-0' />
          <span>{new Date(report.createdAt || report.generatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          {report.sentAt && <span className='text-emerald-600'>· Sent {new Date(report.sentAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
        </div>
      </div>

      {/* Sections */}
      {report.templateSections?.length > 0 && (
        <div className='flex flex-wrap gap-1'>
          {report.templateSections.slice(0, 3).map(s => (
            <span key={s} className='text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full'>{s}</span>
          ))}
          {report.templateSections.length > 3 && (
            <span className='text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full'>+{report.templateSections.length - 3} more</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className='flex items-center gap-2 pt-1 border-t border-slate-100'>
        <button
          onClick={() => onView(report)}
          className='flex-1 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5'
        >
          <HiEye className='w-3.5 h-3.5' /> Preview
        </button>
        <button
          onClick={() => onEditContent(report)}
          className='flex-1 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5'
        >
          <HiPencil className='w-3.5 h-3.5' /> Edit
        </button>
        {report.clientEmail && (
          <button
            onClick={() => onSend(report)}
            className='p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors'
            title={`Send to ${report.clientEmail}`}
          >
            <HiMail className='w-4 h-4' />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClientReportTemplate() {
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();

  const [templates, setTemplates] = useState([]);
  const [generatedReports, setGeneratedReports] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [seedingTemplates, setSeedingTemplates] = useState(false);
  const [activeTab, setActiveTab] = useState('templates');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editingReport, setEditingReport] = useState(null);
  const [editingReportContent, setEditingReportContent] = useState(null);
  const [showActionsMenu, setShowActionsMenu] = useState(null);
  const [pendingDeleteTemplate, setPendingDeleteTemplate] = useState(null);
  const [pendingDeleteReport, setPendingDeleteReport] = useState(null);
  const [previewReport, setPreviewReport] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);

  const canAccess = useMemo(() => {
    if (!currentUser) return false;
    if (isBuyerViewMode) return false;
    return currentUser.role === 'admin' || currentUser.role === 'employee';
  }, [currentUser, isBuyerViewMode]);

  // Close template action menu when clicking outside
  useEffect(() => {
    if (!showActionsMenu) return;
    const handler = (e) => {
      if (!e.target.closest('[data-tmpl-menu]')) setShowActionsMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showActionsMenu]);

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await apiClient.get('/report-templates');
      setTemplates(res?.data || res || []);
    } catch (_) {}
    setLoadingTemplates(false);
  }, []);

  const fetchReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const res = await apiClient.get('/generated-reports?limit=100');
      setGeneratedReports(res?.data || []);
    } catch (_) {}
    setLoadingReports(false);
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    fetchTemplates();
    fetchReports();
  }, [canAccess, fetchTemplates, fetchReports]);

  const handleSeedTemplates = async () => {
    setSeedingTemplates(true);
    try {
      const created = await Promise.all(
        DEFAULT_TEMPLATES.map(t => apiClient.post('/report-templates', t).then(r => r?.data || r))
      );
      setTemplates(prev => [...created, ...prev]);
    } catch (err) {
      console.error('Failed to seed templates:', err);
    }
    setSeedingTemplates(false);
  };

  const getReportTypeInfo = (typeId) => REPORT_TYPES.find(t => t.id === typeId) || REPORT_TYPES[0];

  const filteredTemplates = useMemo(() => {
    if (!searchQuery) return templates;
    const q = searchQuery.toLowerCase();
    return templates.filter(t => t.name.toLowerCase().includes(q) || t.type.toLowerCase().includes(q));
  }, [templates, searchQuery]);

  const filteredReports = useMemo(() => {
    if (!searchQuery) return generatedReports;
    const q = searchQuery.toLowerCase();
    return generatedReports.filter(r =>
      r.templateName.toLowerCase().includes(q) ||
      r.clientName.toLowerCase().includes(q) ||
      r.propertyName.toLowerCase().includes(q)
    );
  }, [generatedReports, searchQuery]);

  const handleSaveTemplate = async (formData) => {
    try {
      if (editingTemplate) {
        const res = await apiClient.patch(`/report-templates/${editingTemplate._id}`, formData);
        const updated = res?.data || res;
        setTemplates(prev => prev.map(t => t._id === editingTemplate._id ? updated : t));
      } else {
        const res = await apiClient.post('/report-templates', formData);
        const created = res?.data || res;
        setTemplates(prev => [created, ...prev]);
      }
    } catch (err) {
      console.error('Failed to save template:', err);
    }
    setEditingTemplate(null);
  };

  const handleGenerateReport = async (formData, existingReportId) => {
    const template = templates.find(t => t._id === formData.templateId);
    const reportDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const html = buildReportHtml({
      template: template || { name: formData.templateId, type: 'property_summary', sections: [] },
      clientName: formData.clientName,
      propertyName: formData.propertyName,
      notes: formData.notes,
      agentName: currentUser?.username || 'Agent',
      reportDate,
      listing: formData.listing || null,
    });

    const payload = {
      templateId: formData.templateId || null,
      templateName: template?.name || 'Custom Report',
      templateType: template?.type || 'property_summary',
      templateSections: template?.sections || [],
      clientId: formData.clientId || null,
      clientName: formData.clientName,
      clientEmail: formData.clientEmail || '',
      propertyName: formData.propertyName,
      listingId: formData.listing?._id || null,
      notes: formData.notes || '',
      agentName: currentUser?.username || 'Agent',
      reportDate,
      html,
    };

    try {
      if (existingReportId) {
        // Edit & regenerate — update in place
        const res = await apiClient.patch(`/generated-reports/${existingReportId}`, { ...payload, status: 'draft' });
        const updated = res?.data || res;
        setGeneratedReports(prev => prev.map(r => r._id === existingReportId ? updated : r));
        setPreviewReport(updated);
      } else {
        // New report
        const res = await apiClient.post('/generated-reports', payload);
        const created = res?.data || res;
        setGeneratedReports(prev => [created, ...prev]);
        setPreviewReport(created);
        // Update template usage count
        if (formData.templateId) {
          try {
            const tRes = await apiClient.post(`/report-templates/${formData.templateId}/use`);
            const updated = tRes?.data || tRes;
            setTemplates(prev => prev.map(t => t._id === formData.templateId ? updated : t));
          } catch (_) {}
        }
      }
      setActiveTab('generated');
    } catch (err) {
      console.error('Failed to save report:', err);
    }
  };

  const handleSendReport = async (report) => {
    const res = await apiClient.post(`/generated-reports/${report._id}/send`);
    const updated = res?.data || res;
    setGeneratedReports(prev => prev.map(r => r._id === report._id ? updated : r));
    if (previewReport?._id === report._id) setPreviewReport(updated);
  };

  const handleDeleteReport = (id) => setPendingDeleteReport(id);

  const handleSaveReportContent = async (id, html) => {
    const res = await apiClient.patch(`/generated-reports/${id}`, { html, status: 'draft' });
    const updated = res?.data || res;
    setGeneratedReports(prev => prev.map(r => r._id === id ? updated : r));
    if (previewReport?._id === id) setPreviewReport(updated);
  };

  const handleDuplicateTemplate = async (template) => {
    try {
      const res = await apiClient.post('/report-templates', {
        name: `${template.name} (Copy)`,
        type: template.type,
        description: template.description,
        sections: template.sections,
      });
      const created = res?.data || res;
      setTemplates(prev => [created, ...prev]);
    } catch (err) {
      console.error('Failed to duplicate template:', err);
    }
    setShowActionsMenu(null);
  };

  const [preselectedTemplateId, setPreselectedTemplateId] = useState('');

  const openGenerateModal = (report = null, templateId = '') => {
    setEditingReport(report);
    setPreselectedTemplateId(templateId);
    setShowGenerateModal(true);
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
      <div className='bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl px-6 py-5'>
        <div className='flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
          <div>
            <h1 className='text-xl font-bold text-white'>Client Reports</h1>
            <p className='text-sm text-slate-400 mt-1'>{templates.length} templates · {generatedReports.length} reports generated</p>
          </div>
          <div className='flex items-center gap-2'>
            <button
              onClick={() => openGenerateModal()}
              className='px-4 py-2 rounded-lg border border-white/10 bg-white/10 hover:bg-white/20 text-white text-sm font-medium flex items-center gap-1.5 transition-colors'
            >
              <HiDocumentText className='w-4 h-4' />
              Generate Report
            </button>
            <button
              onClick={() => { setEditingTemplate(null); setShowTemplateModal(true); }}
              className='px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium flex items-center gap-1.5 transition-colors'
            >
              <HiPlus className='w-4 h-4' />
              New Template
            </button>
          </div>
        </div>
      </div>

      {/* Report Type Quick-create Cards */}
      <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3'>
        {REPORT_TYPES.map((type) => {
          const matchingTemplate = templates.find(t => t.type === type.id);
          return (
            <div
              key={type.id}
              className='bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer group'
              onClick={() => openGenerateModal(null, matchingTemplate?._id || '')}
              title={matchingTemplate ? `Generate using "${matchingTemplate.name}"` : 'Generate report (select template in form)'}
            >
              <div className={`w-9 h-9 rounded-xl ${type.color} flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                <type.Component className='w-5 h-5' />
              </div>
              <h3 className='text-sm font-medium text-slate-900 leading-tight'>{type.label}</h3>
              <p className='text-xs text-slate-500 mt-1 line-clamp-2'>{type.description}</p>
              {matchingTemplate && (
                <p className='text-xs text-indigo-500 mt-2 truncate font-medium'>{matchingTemplate.name}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className='bg-white border border-slate-200 rounded-xl'>
        <div className='border-b border-slate-200 px-4'>
          <div className='flex items-center justify-between'>
            <div className='flex gap-1'>
              {[
                { key: 'templates', label: 'Templates', count: templates.length },
                { key: 'generated', label: 'Generated Reports', count: generatedReports.length },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === tab.key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${activeTab === tab.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
            <div className='flex items-center gap-2 py-2'>
              <button
                onClick={() => { fetchTemplates(); fetchReports(); }}
                className='p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50'
                title='Refresh'
              >
                <HiRefresh className='w-4 h-4' />
              </button>
              <div className='flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white'>
                <HiSearch className='w-4 h-4 text-slate-400' />
                <input
                  type='text'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder='Search...'
                  className='bg-transparent outline-none text-sm text-slate-700 placeholder:text-slate-400 w-36'
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className='text-slate-400 hover:text-slate-600'><HiX className='w-4 h-4' /></button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Templates Tab ── */}
        {activeTab === 'templates' && (
          <div className='p-4'>
            {loadingTemplates ? (
              <div className='py-16 text-center'>
                <div className='w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto mb-3' />
                <p className='text-sm text-slate-500'>Loading templates...</p>
              </div>
            ) : (
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                {filteredTemplates.map((template) => {
                  const typeInfo = getReportTypeInfo(template.type);
                  return (
                    <div key={template._id} className='bg-slate-50 border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors'>
                      <div className='flex items-start justify-between mb-3'>
                        <div className='flex items-center gap-3 min-w-0'>
                          <div className={`w-9 h-9 rounded-xl ${typeInfo.color} flex items-center justify-center shrink-0`}>
                            <typeInfo.Component className='w-5 h-5' />
                          </div>
                          <div className='min-w-0'>
                            <h3 className='text-sm font-semibold text-slate-900 truncate'>{template.name}</h3>
                            <p className='text-xs text-slate-500'>{typeInfo.label}</p>
                          </div>
                        </div>
                        <div className='relative shrink-0' data-tmpl-menu='true'>
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowActionsMenu(showActionsMenu === template._id ? null : template._id); }}
                            className='p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600'
                          >
                            <HiDotsVertical className='w-5 h-5' />
                          </button>
                          {showActionsMenu === template._id && (
                            <div className='absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-30 py-1'>
                              <button
                                onClick={() => { setPreviewTemplate(template); setShowActionsMenu(null); }}
                                className='w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700'
                              >
                                <HiEye className='w-4 h-4' /> Preview
                              </button>
                              <button
                                onClick={() => { setEditingTemplate(template); setShowTemplateModal(true); setShowActionsMenu(null); }}
                                className='w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700'
                              >
                                <HiPencil className='w-4 h-4' /> Edit
                              </button>
                              <button
                                onClick={() => handleDuplicateTemplate(template)}
                                className='w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700'
                              >
                                <HiDuplicate className='w-4 h-4' /> Duplicate
                              </button>
                              <div className='h-px bg-slate-100 my-1' />
                              <button
                                onClick={() => { setPendingDeleteTemplate(template._id); setShowActionsMenu(null); }}
                                className='w-full text-left px-3 py-2 text-sm hover:bg-rose-50 text-rose-600 flex items-center gap-2'
                              >
                                <HiTrash className='w-4 h-4' /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {template.description && (
                        <p className='text-xs text-slate-500 mb-3 line-clamp-2'>{template.description}</p>
                      )}

                      {template.sections?.length > 0 && (
                        <div className='flex flex-wrap gap-1 mb-3'>
                          {template.sections.slice(0, 3).map(s => (
                            <span key={s} className='text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full'>{s}</span>
                          ))}
                          {template.sections.length > 3 && (
                            <span className='text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full'>+{template.sections.length - 3}</span>
                          )}
                        </div>
                      )}

                      <div className='flex items-center gap-3 text-xs text-slate-500 mb-3'>
                        <span className='flex items-center gap-1'>
                          <HiCalendar className='w-3.5 h-3.5' />
                          {new Date(template.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                        <span className='flex items-center gap-1'>
                          <HiClipboardList className='w-3.5 h-3.5' />
                          Used {template.usageCount || 0}×
                        </span>
                      </div>

                      <div className='pt-3 border-t border-slate-200 flex items-center gap-1.5'>
                        <button
                          onClick={() => openGenerateModal(null, template._id)}
                          className='flex-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors'
                        >
                          Use Template
                        </button>
                        <button
                          onClick={() => setPreviewTemplate(template)}
                          className='flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors'
                        >
                          <HiEye className='w-3.5 h-3.5' />
                          Preview
                        </button>
                        <button
                          onClick={() => { setEditingTemplate(template); setShowTemplateModal(true); }}
                          className='flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors'
                        >
                          <HiPencil className='w-3.5 h-3.5' />
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
                {filteredTemplates.length === 0 && !searchQuery && (
                  <div className='col-span-full py-12'>
                    <div className='max-w-md mx-auto text-center'>
                      <div className='w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4'>
                        <HiTemplate className='w-7 h-7 text-slate-400' />
                      </div>
                      <p className='text-sm font-semibold text-slate-800 mb-1'>No templates yet</p>
                      <p className='text-xs text-slate-500 mb-6'>Get started instantly with 6 professionally designed report templates, or build your own from scratch.</p>

                      {/* Starter templates preview */}
                      <div className='bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 text-left'>
                        <p className='text-xs font-semibold text-slate-600 mb-3 uppercase tracking-wide'>Included starter templates</p>
                        <div className='space-y-1.5'>
                          {DEFAULT_TEMPLATES.map((t, i) => {
                            const ti = REPORT_TYPES.find(r => r.id === t.type);
                            return (
                              <div key={i} className='flex items-center gap-2.5 group rounded-lg px-2 py-1.5 hover:bg-white hover:shadow-sm transition-all'>
                                <div className={`w-6 h-6 rounded-lg ${ti?.color || 'text-slate-600 bg-slate-100'} flex items-center justify-center shrink-0`}>
                                  {ti ? <ti.Component className='w-3.5 h-3.5' /> : null}
                                </div>
                                <div className='min-w-0 flex-1'>
                                  <p className='text-xs font-semibold text-slate-800 truncate'>{t.name}</p>
                                  <p className='text-xs text-slate-400 truncate'>{t.sections.slice(0, 3).join(' · ')}{t.sections.length > 3 ? ` +${t.sections.length - 3}` : ''}</p>
                                </div>
                                <button
                                  type='button'
                                  onClick={() => setPreviewTemplate(t)}
                                  className='shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity'
                                >
                                  <HiEye className='w-3.5 h-3.5' />
                                  Preview
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className='flex flex-col gap-2'>
                        <button
                          onClick={handleSeedTemplates}
                          disabled={seedingTemplates}
                          className='w-full px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center gap-2'
                        >
                          {seedingTemplates ? (
                            <><div className='w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin' />Installing…</>
                          ) : (
                            <><HiPlus className='w-4 h-4' />Install 6 Starter Templates</>
                          )}
                        </button>
                        <button
                          onClick={() => { setEditingTemplate(null); setShowTemplateModal(true); }}
                          className='w-full px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50'
                        >
                          Build from scratch
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {filteredTemplates.length === 0 && searchQuery && (
                  <div className='col-span-full py-12 text-center'>
                    <p className='text-sm text-slate-500'>No templates match &ldquo;{searchQuery}&rdquo;</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Generated Reports Tab ── */}
        {activeTab === 'generated' && (
          <div className='p-4'>
            {loadingReports ? (
              <div className='py-16 text-center'>
                <div className='w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mx-auto mb-3' />
                <p className='text-sm text-slate-500'>Loading reports...</p>
              </div>
            ) : filteredReports.length === 0 ? (
              <div className='py-16 text-center'>
                <HiDocumentText className='w-12 h-12 text-slate-300 mx-auto mb-3' />
                <p className='text-sm font-medium text-slate-700 mb-1'>No reports generated yet</p>
                <p className='text-xs text-slate-500 mb-4'>Generate a report from any of your templates to see it here.</p>
                <button
                  onClick={() => openGenerateModal()}
                  className='px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800'
                >
                  Generate your first report
                </button>
              </div>
            ) : (
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                {filteredReports.map((report) => (
                  <ReportCard
                    key={report._id}
                    report={report}
                    typeInfo={getReportTypeInfo(report.templateType)}
                    onView={setPreviewReport}
                    onEdit={(r) => openGenerateModal(r)}
                    onEditContent={setEditingReportContent}
                    onSend={handleSendReport}
                    onDelete={handleDeleteReport}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirm — delete template */}
      <ConfirmDialog
        open={!!pendingDeleteTemplate}
        title='Delete template?'
        description='This cannot be undone. Generated reports using this template will remain.'
        confirmLabel='Delete'
        onConfirm={async () => {
          const id = pendingDeleteTemplate;
          setPendingDeleteTemplate(null);
          try {
            await apiClient.delete(`/report-templates/${id}`);
            setTemplates(prev => prev.filter(t => t._id !== id));
          } catch (err) {
            console.error('Failed to delete template:', err);
          }
        }}
        onCancel={() => setPendingDeleteTemplate(null)}
      />

      {/* Confirm — delete generated report */}
      <ConfirmDialog
        open={!!pendingDeleteReport}
        title='Delete report?'
        description='This will permanently remove the saved report and its HTML. This cannot be undone.'
        confirmLabel='Delete'
        onConfirm={async () => {
          const id = pendingDeleteReport;
          setPendingDeleteReport(null);
          try {
            await apiClient.delete(`/generated-reports/${id}`);
            setGeneratedReports(prev => prev.filter(r => r._id !== id));
          } catch (err) {
            console.error('Failed to delete report:', err);
          }
        }}
        onCancel={() => setPendingDeleteReport(null)}
      />

      <TemplateModal
        isOpen={showTemplateModal}
        onClose={() => { setShowTemplateModal(false); setEditingTemplate(null); }}
        template={editingTemplate}
        onSave={handleSaveTemplate}
      />
      <GenerateReportModal
        isOpen={showGenerateModal}
        onClose={() => { setShowGenerateModal(false); setEditingReport(null); setPreselectedTemplateId(''); }}
        templates={templates}
        onGenerate={handleGenerateReport}
        editingReport={editingReport}
        preselectedTemplateId={preselectedTemplateId}
        onInstallTemplates={handleSeedTemplates}
      />
      <ReportPreviewModal
        isOpen={!!previewReport}
        onClose={() => setPreviewReport(null)}
        report={previewReport}
        onSend={handleSendReport}
      />
      <ReportEditorModal
        isOpen={!!editingReportContent}
        onClose={() => setEditingReportContent(null)}
        report={editingReportContent}
        onSave={handleSaveReportContent}
      />
      <TemplatePreviewModal
        isOpen={!!previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        template={previewTemplate}
        onEdit={(t) => { setEditingTemplate(t); setShowTemplateModal(true); }}
        onUse={(id) => openGenerateModal(null, id)}
      />
    </div>
  );
}
