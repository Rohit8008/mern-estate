import React, { useState, useEffect, useMemo } from 'react';
import { parseJsonSafely, fetchWithRefresh } from '../utils/http';
import * as XLSX from 'xlsx';

const DynamicListingTable = ({ category, onEdit, onDelete, currentUser }) => {
  const [listings, setListings] = useState([]);
  const [categoryFields, setCategoryFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filterConfig, setFilterConfig] = useState({});
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(new Set());

  // Core fields that are always visible
  const coreFields = [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'address', label: 'Address', type: 'text', required: true },
    { key: 'regularPrice', label: 'Price', type: 'number', required: true },
    { key: 'type', label: 'Type', type: 'select', options: ['rent', 'sale'], required: true },
    { key: 'bedrooms', label: 'Bedrooms', type: 'number', required: true },
    { key: 'bathrooms', label: 'Bathrooms', type: 'number', required: true },
    { key: 'offer', label: 'Offer', type: 'boolean', required: false },
    { key: 'parking', label: 'Parking', type: 'boolean', required: false },
    { key: 'furnished', label: 'Furnished', type: 'boolean', required: false },
  ];

  // Fetch category fields
  useEffect(() => {
    if (!category) return;
    
    const fetchCategoryFields = async () => {
      try {
        const res = await fetchWithRefresh(`/api/category/by-slug/${category}`);
        const data = await parseJsonSafely(res);
        if (data?.fields) {
          setCategoryFields(data.fields.sort((a, b) => (a.order || 0) - (b.order || 0)));
        }
      } catch (err) {
        console.error('Error fetching category fields:', err);
      }
    };

    fetchCategoryFields();
  }, [category]);

  // Fetch listings
  useEffect(() => {
    if (!category) return;

    const fetchListings = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWithRefresh(`/api/listing/get?category=${category}&limit=1000`);
        const data = await parseJsonSafely(res);
        if (data) {
          const items = data?.data?.listings || [];
          setListings(items);
        }
      } catch (err) {
        setError('Failed to fetch listings');
        console.error('Error fetching listings:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchListings();
  }, [category]);

  // Initialize visible columns
  useEffect(() => {
    const allFields = [...coreFields, ...categoryFields];
    setVisibleColumns(new Set(allFields.map(f => f.key)));
  }, [categoryFields]);

  // Get all available fields
  const allFields = useMemo(() => {
    return [...coreFields, ...categoryFields];
  }, [categoryFields]);

  // Get visible fields
  const visibleFields = useMemo(() => {
    return allFields.filter(field => visibleColumns.has(field.key));
  }, [allFields, visibleColumns]);

  // Sort listings
  const sortedListings = useMemo(() => {
    if (!sortConfig.key) return listings;

    return [...listings].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // Handle attributes
      if (sortConfig.key.startsWith('attr_')) {
        const attrKey = sortConfig.key.replace('attr_', '');
        aVal = a.attributes?.[attrKey];
        bVal = b.attributes?.[attrKey];
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [listings, sortConfig]);

  // Filter listings
  const filteredListings = useMemo(() => {
    return sortedListings.filter(listing => {
      return Object.entries(filterConfig).every(([key, value]) => {
        if (!value) return true;
        
        let listingValue = listing[key];
        if (key.startsWith('attr_')) {
          const attrKey = key.replace('attr_', '');
          listingValue = listing.attributes?.[attrKey];
        }

        return String(listingValue || '').toLowerCase().includes(value.toLowerCase());
      });
    });
  }, [sortedListings, filterConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleFilter = (key, value) => {
    setFilterConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleCellEdit = (listingId, fieldKey, currentValue) => {
    setEditingCell({ listingId, fieldKey });
    setEditValue(currentValue || '');
  };

  const handleCellSave = async () => {
    if (!editingCell) return;

    const { listingId, fieldKey } = editingCell;
    const listing = listings.find(l => l._id === listingId);
    if (!listing) return;

    try {
      const updateData = {};
      
      if (fieldKey.startsWith('attr_')) {
        const attrKey = fieldKey.replace('attr_', '');
        updateData.attributes = {
          ...listing.attributes,
          [attrKey]: editValue
        };
      } else {
        updateData[fieldKey] = editValue;
      }

      const res = await fetchWithRefresh(`/api/listing/update/${listingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (res.ok) {
        // Update local state
        setListings(prev => prev.map(l => 
          l._id === listingId 
            ? { ...l, ...updateData }
            : l
        ));
      }
    } catch (err) {
      console.error('Error updating listing:', err);
    }

    setEditingCell(null);
    setEditValue('');
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) return;
    
    if (!confirm(`Delete ${selectedRows.size} listings?`)) return;

    try {
      const deletePromises = Array.from(selectedRows).map(id =>
        fetchWithRefresh(`/api/listing/delete/${id}`, { method: 'DELETE' })
      );

      await Promise.all(deletePromises);
      setListings(prev => prev.filter(l => !selectedRows.has(l._id)));
      setSelectedRows(new Set());
    } catch (err) {
      console.error('Error deleting listings:', err);
    }
  };

  const handleExportExcel = () => {
    const exportData = filteredListings.map(listing => {
      const row = {};
      
      visibleFields.forEach(field => {
        let value = listing[field.key];
        
        if (field.key.startsWith('attr_')) {
          const attrKey = field.key.replace('attr_', '');
          value = listing.attributes?.[attrKey];
        }

        // Format value based on type
        if (field.type === 'boolean') {
          value = value ? 'Yes' : 'No';
        } else if (field.type === 'number' && typeof value === 'number') {
          value = value.toLocaleString();
        } else if (field.type === 'date' && value) {
          value = new Date(value).toLocaleDateString();
        }

        row[field.label] = value || '';
      });

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Listings');
    
    const fileName = `${category || 'listings'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const toggleColumnVisibility = (fieldKey) => {
    setVisibleColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldKey)) {
        newSet.delete(fieldKey);
      } else {
        newSet.add(fieldKey);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === filteredListings.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredListings.map(l => l._id)));
    }
  };

  const toggleSelectRow = (listingId) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(listingId)) {
        newSet.delete(listingId);
      } else {
        newSet.add(listingId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600 p-4">
        <p>{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Toolbar */}
      <div className="flex justify-between items-center mb-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowColumnManager(!showColumnManager)}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Manage Columns
          </button>
          <button
            onClick={handleExportExcel}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Export Excel
          </button>
          {selectedRows.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Delete Selected ({selectedRows.size})
            </button>
          )}
        </div>
        <div className="text-sm text-gray-600">
          {filteredListings.length} listings
        </div>
      </div>

      {/* Column Manager */}
      {showColumnManager && (
        <div className="mb-4 p-4 bg-white border rounded-lg shadow">
          <h3 className="font-semibold mb-3">Manage Columns</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {allFields.map(field => (
              <label key={field.key} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={visibleColumns.has(field.key)}
                  onChange={() => toggleColumnVisibility(field.key)}
                  className="rounded"
                />
                <span className="text-sm">{field.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedRows.size === filteredListings.length && filteredListings.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
              {visibleFields.map(field => (
                <th
                  key={field.key}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort(field.key)}
                >
                  <div className="flex items-center space-x-1">
                    <span>{field.label}</span>
                    {sortConfig.key === field.key && (
                      <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
            <tr>
              <th className="px-4 py-2"></th>
              {visibleFields.map(field => (
                <th key={field.key} className="px-4 py-2">
                  <input
                    type="text"
                    placeholder={`Filter ${field.label}...`}
                    value={filterConfig[field.key] || ''}
                    onChange={(e) => handleFilter(field.key, e.target.value)}
                    className="w-full px-2 py-1 text-xs border rounded"
                  />
                </th>
              ))}
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredListings.map(listing => (
              <tr key={listing._id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedRows.has(listing._id)}
                    onChange={() => toggleSelectRow(listing._id)}
                    className="rounded"
                  />
                </td>
                {visibleFields.map(field => {
                  const fieldKey = field.key;
                  let value = listing[fieldKey];
                  
                  if (fieldKey.startsWith('attr_')) {
                    const attrKey = fieldKey.replace('attr_', '');
                    value = listing.attributes?.[attrKey];
                  }

                  const isEditing = editingCell?.listingId === listing._id && editingCell?.fieldKey === fieldKey;

                  return (
                    <td key={fieldKey} className="px-4 py-3 text-sm text-gray-900">
                      {isEditing ? (
                        <div className="flex space-x-1">
                          <input
                            type={field.type === 'number' ? 'number' : 'text'}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="flex-1 px-2 py-1 text-xs border rounded"
                            autoFocus
                          />
                          <button
                            onClick={handleCellSave}
                            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            ✓
                          </button>
                          <button
                            onClick={handleCellCancel}
                            className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                          >
                            ✗
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => handleCellEdit(listing._id, fieldKey, value)}
                          className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                        >
                          {field.type === 'boolean' ? (value ? 'Yes' : 'No') : (value || '-')}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-sm text-gray-900">
                  <div className="flex space-x-2">
                    {currentUser && 
                     (currentUser.role === 'admin' || 
                      currentUser.role === 'employee' || 
                      (currentUser.role === 'seller' && listing.userRef === currentUser._id)) && (
                      <>
                        <button
                          onClick={() => onEdit && onEdit(listing)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDelete && onDelete(listing)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredListings.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No listings found
        </div>
      )}
    </div>
  );
};

export default DynamicListingTable;
