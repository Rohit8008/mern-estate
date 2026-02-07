import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../utils/http';

function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;
  let row = [];
  let cell = '';
  let inQuotes = false;
  while (i < len) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        cell += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (char === ',') {
        row.push(cell);
        cell = '';
        i++;
        continue;
      }
      if (char === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i++;
        continue;
      }
      if (char === '\r') { i++; continue; }
      cell += char;
      i++;
    }
  }
  // last cell
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function normalizeCurrency(input) {
  if (input == null) return '';
  const s = String(input).trim();
  if (!s) return '';
  let x = s.replace(/[,\s]/g, '').replace(/^Rs\.?/i, '');
  // Handle Lac/Lakh and Cr
  let mult = 1;
  const lacMatch = x.match(/(\d+(?:\.\d+)?)\s*(lac|lakh)/i);
  const crMatch = x.match(/(\d+(?:\.\d+)?)\s*(cr|crore)/i);
  if (crMatch) {
    return Math.round(parseFloat(crMatch[1]) * 10000000);
  }
  if (lacMatch) {
    return Math.round(parseFloat(lacMatch[1]) * 100000);
  }
  // Plain number
  const num = parseFloat(x.replace(/[a-zA-Z]/g, ''));
  return Number.isFinite(num) ? Math.round(num) : '';
}

function normalizeBoolean(input) {
  const s = String(input || '').toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === '1';
}

function normalizeNumber(input) {
  const x = String(input || '').replace(/[,\s]/g, '');
  const n = parseFloat(x);
  return Number.isFinite(n) ? n : '';
}

function normalizeDate(input) {
  const d = new Date(input);
  if (isNaN(d.getTime())) return '';
  return d.toISOString();
}

const CORE_FIELDS = ['name','description','address','regularPrice','discountPrice','bedrooms','bathrooms','type','offer','parking','furnished','category'];
const TRANSFORMS = ['none','currency','number','date','boolean'];

export default function AdminImport() {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categoryFields, setCategoryFields] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: [] });
  const fileRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiClient.get('/category/list');
        setCategories(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!selectedCategory) { setCategoryFields([]); return; }
      try {
        const data = await apiClient.get(`/category/by-slug/${selectedCategory}`);
        setCategoryFields(Array.isArray(data?.fields) ? data.fields : []);
      } catch (error) { 
        console.error('Error fetching category fields:', error);
        setCategoryFields([]); 
      }
    })();
  }, [selectedCategory]);

  const sampleRows = useMemo(() => csvRows.slice(0, 10), [csvRows]);

  const loadFile = async (file) => {
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (!rows.length) {
        alert('CSV file is empty or invalid');
        return;
      }
      const hdr = rows[0];
      const body = rows.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''));
      setHeaders(hdr);
      setCsvRows(body);
      // try simple auto-map
      const auto = {};
      hdr.forEach((h, idx) => {
        const key = String(h).trim();
        const lower = key.toLowerCase();
        if (lower.includes('address') || lower.includes('area name')) auto[idx] = { target: 'core', key: 'address', transform: 'none' };
        else if (lower.includes('date')) auto[idx] = { target: 'attr', key: 'date', transform: 'date' };
        else if (lower.includes('rate')) auto[idx] = { target: 'core', key: 'regularPrice', transform: 'currency' };
        else if (lower.includes('sq yard') || lower.includes('yard')) auto[idx] = { target: 'attr', key: 'plotAreaYard', transform: 'number' };
        else if (lower.includes('plot')) auto[idx] = { target: 'attr', key: 'plotSize', transform: 'none' };
        else if (lower.includes('phone')) auto[idx] = { target: 'attr', key: 'phone', transform: 'none' };
        else if (lower.includes('remarks')) auto[idx] = { target: 'attr', key: 'remarks', transform: 'none' };
        else auto[idx] = { target: 'attr', key: key.replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'').toLowerCase(), transform: 'none' };
      });
      setMapping(auto);
    } catch (error) {
      console.error('Error loading file:', error);
      alert('Error loading CSV file. Please check the file format.');
    }
  };

  const transformValue = (val, transform) => {
    switch (transform) {
      case 'currency': return normalizeCurrency(val);
      case 'number': return normalizeNumber(val);
      case 'date': return normalizeDate(val);
      case 'boolean': return normalizeBoolean(val);
      default: return val;
    }
  };

  const startImport = async () => {
    if (!selectedCategory) {
      alert('Please select a category first');
      return;
    }
    if (!csvRows.length) {
      alert('Please upload a CSV file first');
      return;
    }
    setImporting(true);
    setProgress({ done: 0, total: csvRows.length, errors: [] });
    const concurrency = 3;
    let index = 0;
    const workers = new Array(concurrency).fill(0).map(async () => {
      while (index < csvRows.length) {
        const i = index++;
        if (i >= csvRows.length) break;
        const row = csvRows[i];
        const payload = {
          name: row[0] && String(row[0]).trim() ? String(row[0]).trim() : `Listing ${i + 1}`,
          description: '',
          address: '',
          type: 'sale',
          bedrooms: 1,
          bathrooms: 1,
          regularPrice: 0,
          discountPrice: 0,
          offer: false,
          parking: false,
          furnished: false,
          imageUrls: [],
          category: selectedCategory,
          attributes: {},
        };
        headers.forEach((h, colIdx) => {
          const map = mapping[colIdx];
          if (!map || !map.key) return;
          const raw = row[colIdx];
          const val = transformValue(raw, map.transform || 'none');
          if (map.target === 'core') {
            payload[map.key] = val;
          } else {
            payload.attributes[map.key] = val;
          }
        });
        // basic fallbacks
        if (!payload.address && payload.attributes.address) payload.address = payload.attributes.address;
        if (!payload.name) payload.name = payload.address || `Listing ${i + 1}`;
        try {
          const data = await apiClient.post('/listing/create', payload);
          if (data?.success === false) throw new Error(data?.message || 'Failed');
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        } catch (e) {
          console.error(`Error importing row ${i + 2}:`, e);
          setProgress((p) => ({ ...p, done: p.done + 1, errors: [...p.errors, { index: i, message: e.message }] }));
        }
      }
    });
    await Promise.all(workers);
    setImporting(false);
    
    // Show completion message
    const totalErrors = progress.errors.length;
    if (totalErrors === 0) {
      alert(`Import completed successfully! ${csvRows.length} listings imported.`);
    } else {
      alert(`Import completed with ${totalErrors} errors. Check the error list below.`);
    }
  };

  return (
    <main className='max-w-6xl mx-auto px-4 py-8'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-bold text-slate-800'>Bulk Import Listings (CSV)</h1>
        <Link to='/categories' className='text-blue-600 hover:underline'>Back to Categories</Link>
      </div>
      <div className='mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3'>
        <div className='flex flex-col gap-2'>
          <label className='font-semibold'>Category</label>
          <select className='border p-2 rounded' value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
            <option value=''>Select category</option>
            {categories.map((c) => (
              <option key={c._id} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className='flex flex-col gap-2'>
          <label className='font-semibold'>CSV File</label>
          <input ref={fileRef} type='file' accept='.csv,text/csv' className='border p-2 rounded' onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) loadFile(f);
          }} />
        </div>
        <div className='flex items-end'>
          <button disabled={!headers.length || !selectedCategory || importing} onClick={startImport} className='px-4 py-2 rounded bg-green-700 text-white disabled:opacity-60'>{importing ? 'Importing...' : 'Start Import'}</button>
        </div>
      </div>

      {headers.length > 0 && (
        <div className='mt-6'>
          <h2 className='font-semibold text-lg mb-2'>Map Columns</h2>
          <div className='overflow-auto border rounded'>
            <table className='min-w-full text-sm'>
              <thead className='bg-slate-50'>
                <tr>
                  <th className='p-2 text-left'>CSV Column</th>
                  <th className='p-2 text-left'>Sample</th>
                  <th className='p-2 text-left'>Target</th>
                  <th className='p-2 text-left'>Field/Key</th>
                  <th className='p-2 text-left'>Transform</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, idx) => (
                  <tr key={idx} className='border-t'>
                    <td className='p-2 font-medium'>{h}</td>
                    <td className='p-2 text-slate-600'>{sampleRows[0]?.[idx] ?? ''}</td>
                    <td className='p-2'>
                      <select className='border p-1 rounded' value={mapping[idx]?.target || 'attr'} onChange={(e) => setMapping((m) => ({ ...m, [idx]: { ...(m[idx]||{}), target: e.target.value } }))}>
                        <option value='core'>Core</option>
                        <option value='attr'>Attribute</option>
                      </select>
                    </td>
                    <td className='p-2'>
                      {mapping[idx]?.target === 'core' ? (
                        <select className='border p-1 rounded' value={mapping[idx]?.key || ''} onChange={(e) => setMapping((m) => ({ ...m, [idx]: { ...(m[idx]||{}), key: e.target.value } }))}>
                          <option value=''>Select core field</option>
                          {CORE_FIELDS.map((cf) => <option key={cf} value={cf}>{cf}</option>)}
                        </select>
                      ) : (
                        <input className='border p-1 rounded' value={mapping[idx]?.key || ''} onChange={(e) => setMapping((m) => ({ ...m, [idx]: { ...(m[idx]||{}), key: e.target.value } }))} placeholder='attribute key' />
                      )}
                    </td>
                    <td className='p-2'>
                      <select className='border p-1 rounded' value={mapping[idx]?.transform || 'none'} onChange={(e) => setMapping((m) => ({ ...m, [idx]: { ...(m[idx]||{}), transform: e.target.value } }))}>
                        {TRANSFORMS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {importing || progress.total > 0 ? (
        <div className='mt-6'>
          <div className='flex items-center gap-4 mb-4'>
            <div className='text-slate-700 font-medium'>
              Imported {progress.done} / {progress.total}
            </div>
            {importing && (
              <div className='flex items-center gap-2 text-blue-600'>
                <div className='animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full'></div>
                <span className='text-sm'>Importing...</span>
              </div>
            )}
          </div>
          
          {/* Progress Bar */}
          {progress.total > 0 && (
            <div className='w-full bg-gray-200 rounded-full h-2 mb-4'>
              <div 
                className='bg-blue-600 h-2 rounded-full transition-all duration-300' 
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              ></div>
            </div>
          )}
          
          {progress.errors.length > 0 && (
            <div className='mt-2 p-3 border rounded bg-red-50 text-red-700 text-sm'>
              <div className='font-semibold mb-1'>Errors ({progress.errors.length}):</div>
              <ul className='list-disc pl-5 max-h-48 overflow-auto'>
                {progress.errors.map((e, i) => (
                  <li key={i}>Row {e.index + 2}: {e.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </main>
  );
}


