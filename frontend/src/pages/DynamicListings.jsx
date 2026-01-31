import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { parseJsonSafely, fetchWithRefresh } from '../utils/http';
import DynamicListingTable from '../components/DynamicListingTable';
import { useSelector } from 'react-redux';
import { useBuyerView } from '../contexts/BuyerViewContext';

const DynamicListings = () => {
  const { categorySlug } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useSelector((state) => state.user);
  const { isBuyerViewMode } = useBuyerView();
  const [category, setCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCategory = async () => {
      if (!categorySlug) return;
      
      try {
        setLoading(true);
        const res = await fetchWithRefresh(`/api/category/by-slug/${categorySlug}`);
        const data = await parseJsonSafely(res);
        
        if (data) {
          setCategory(data);
        } else {
          setError('Category not found');
        }
      } catch (err) {
        setError('Failed to fetch category');
        console.error('Error fetching category:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCategory();
  }, [categorySlug]);

  const handleEdit = (listing) => {
    // Check if user has permission to edit
    if (currentUser && 
        (currentUser.role === 'admin' || 
         currentUser.role === 'employee' || 
         (currentUser.role === 'seller' && listing.userRef === currentUser._id))) {
      navigate(`/update-listing/${listing._id}`);
    } else {
      alert('You do not have permission to edit this listing');
    }
  };

  const handleDelete = async (listing) => {
    // Check if user has permission to delete
    if (!currentUser || 
        (currentUser.role !== 'admin' && 
         currentUser.role !== 'employee' && 
         !(currentUser.role === 'seller' && listing.userRef === currentUser._id))) {
      alert('You do not have permission to delete this listing');
      return;
    }

    if (!confirm(`Delete listing "${listing.name}"?`)) return;

    try {
      const res = await fetchWithRefresh(`/api/listing/delete/${listing._id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        // Refresh the page or update state
        window.location.reload();
      } else {
        alert('Failed to delete listing');
      }
    } catch (err) {
      console.error('Error deleting listing:', err);
      alert('Failed to delete listing');
    }
  };

  const handleAddNew = () => {
    navigate(`/create-listing?category=${categorySlug}`);
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
      <div className="text-center py-8">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => navigate('/categories')}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Back to Categories
        </button>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 mb-4">Category not found</p>
        <button
          onClick={() => navigate('/categories')}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Back to Categories
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{category.name} Listings</h1>
          <p className="text-gray-600 mt-1">
            Dynamic table view with Excel-like functionality
          </p>
        </div>
        <div className="flex space-x-3">
          {!isBuyerViewMode && (currentUser?.role === 'admin' || currentUser?.role === 'employee' || currentUser?.role === 'seller') && (
            <button
              onClick={handleAddNew}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <span>+</span>
              <span>Add New Listing</span>
            </button>
          )}
          <button
            onClick={() => navigate('/categories')}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Back to Categories
          </button>
        </div>
      </div>

      {/* Category Info */}
      {category.description && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <p className="text-blue-800">{category.description}</p>
        </div>
      )}

      {/* Dynamic Table */}
      <DynamicListingTable
        category={categorySlug}
        onEdit={handleEdit}
        onDelete={handleDelete}
        currentUser={currentUser}
      />

      {/* Category Fields Info */}
      {category.fields && category.fields.length > 0 && (
        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-3">Available Fields</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {category.fields.map((field, index) => (
              <div key={index} className="flex items-center space-x-2 text-sm">
                <span className="font-medium text-gray-700">{field.label}:</span>
                <span className="text-gray-600">{field.type}</span>
                {field.required && (
                  <span className="text-red-500 text-xs">*</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DynamicListings;
