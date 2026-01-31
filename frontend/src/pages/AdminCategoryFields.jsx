import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { parseJsonSafely, fetchWithRefresh } from '../utils/http';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean (Yes/No)' },
  { value: 'select', label: 'Select (Dropdown)' },
  { value: 'date', label: 'Date' },
];

export default function AdminCategoryFields() {
  const { slug } = useParams();
  const [category, setCategory] = useState(null);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchCategory = async () => {
      if (!slug) return;
      try {
        setLoading(true);
        const res = await fetchWithRefresh(`/api/category/by-slug/${slug}`);
        const data = await parseJsonSafely(res);
        if (data) {
          setCategory(data);
          setFields(data.fields || []);
        } else {
          setError('Category not found');
        }
      } catch (e) {
        setError('Failed to load category');
      } finally {
        setLoading(false);
      }
    };
    fetchCategory();
  }, [slug]);

  const addField = () => {
    const newField = {
      key: '',
      label: '',
      type: 'text',
      required: false,
      options: [],
      description: '',
      placeholder: '',
      defaultValue: '',
      min: undefined,
      max: undefined,
      pattern: '',
      multiple: false,
      order: fields.length,
    };
    setFields([...fields, newField]);
  };

  const updateField = (index, key, value) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], [key]: value };
    
    // Auto-generate key from label if key is empty
    if (key === 'label' && !newFields[index].key) {
      newFields[index].key = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }
    
    setFields(newFields);
  };

  const removeField = (index) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const moveField = (index, direction) => {
    const newFields = [...fields];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex >= 0 && newIndex < newFields.length) {
      [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
      // Update order values
      newFields.forEach((field, i) => {
        field.order = i;
      });
      setFields(newFields);
    }
  };

  const addOption = (fieldIndex) => {
    const newFields = [...fields];
    newFields[fieldIndex].options = [...(newFields[fieldIndex].options || []), ''];
    setFields(newFields);
  };

  const updateOption = (fieldIndex, optionIndex, value) => {
    const newFields = [...fields];
    newFields[fieldIndex].options[optionIndex] = value;
    setFields(newFields);
  };

  const removeOption = (fieldIndex, optionIndex) => {
    const newFields = [...fields];
    newFields[fieldIndex].options = newFields[fieldIndex].options.filter((_, i) => i !== optionIndex);
    setFields(newFields);
  };

  const saveFields = async () => {
    try {
      setSaving(true);
      setError('');
      setMessage('');

      // Validate fields
      const errors = [];
      fields.forEach((field, index) => {
        if (!field.key.trim()) errors.push(`Field ${index + 1}: Key is required`);
        if (!field.label.trim()) errors.push(`Field ${index + 1}: Label is required`);
        if (field.type === 'select' && (!field.options || field.options.length === 0)) {
          errors.push(`Field ${index + 1}: Select fields must have at least one option`);
        }
        if (field.type === 'number') {
          if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
            errors.push(`Field ${index + 1}: Min value cannot be greater than max value`);
          }
        }
      });

      if (errors.length > 0) {
        setError(errors.join('\n'));
        return;
      }

      const res = await fetchWithRefresh(`/api/category/update-fields/${category._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });

      const data = await parseJsonSafely(res);
      if (res.ok && data) {
        setMessage('Fields saved successfully!');
        setCategory({ ...category, fields });
      } else {
        setError(data?.message || 'Failed to save fields');
      }
    } catch (e) {
      setError('Failed to save fields');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error && !category) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 mb-4">{error}</p>
        <Link to="/categories" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          Back to Categories
        </Link>
      </div>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            Manage Fields for {category?.name}
          </h1>
          <p className="text-gray-600 mt-1">
            Configure dynamic fields that will appear in the Excel-like listing view
          </p>
        </div>
        <Link to="/categories" className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
          Back to Categories
        </Link>
      </div>

      {message && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 whitespace-pre-line">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Dynamic Fields</h2>
            <button
              onClick={addField}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Add Field
            </button>
          </div>
        </div>

        <div className="p-6">
          {fields.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No fields configured yet.</p>
              <p className="text-sm mt-1">Click "Add Field" to create your first dynamic field.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {fields.map((field, index) => (
                <div key={index} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold text-gray-900">Field {index + 1}</h3>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => moveField(index, 'up')}
                        disabled={index === 0}
                        className="px-2 py-1 text-xs bg-gray-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveField(index, 'down')}
                        disabled={index === fields.length - 1}
                        className="px-2 py-1 text-xs bg-gray-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => removeField(index)}
                        className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Field Key *
                      </label>
                      <input
                        type="text"
                        value={field.key}
                        onChange={(e) => updateField(index, 'key', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., plot_size"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Field Label *
                      </label>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => updateField(index, 'label', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., Plot Size"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Field Type
                      </label>
                      <select
                        value={field.type}
                        onChange={(e) => updateField(index, 'type', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {FIELD_TYPES.map(type => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Placeholder
                      </label>
                      <input
                        type="text"
                        value={field.placeholder}
                        onChange={(e) => updateField(index, 'placeholder', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., Enter plot size in sq ft"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={field.description}
                        onChange={(e) => updateField(index, 'description', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Optional description"
                      />
                    </div>

                    <div className="flex items-center">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => updateField(index, 'required', e.target.checked)}
                          className="mr-2"
                        />
                        <span className="text-sm font-medium text-gray-700">Required</span>
                      </label>
                    </div>
                  </div>

                  {/* Number field specific options */}
                  {field.type === 'number' && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Min Value
                        </label>
                        <input
                          type="number"
                          value={field.min || ''}
                          onChange={(e) => updateField(index, 'min', e.target.value ? Number(e.target.value) : undefined)}
                          className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Max Value
                        </label>
                        <input
                          type="number"
                          value={field.max || ''}
                          onChange={(e) => updateField(index, 'max', e.target.value ? Number(e.target.value) : undefined)}
                          className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  )}

                  {/* Select field specific options */}
                  {field.type === 'select' && (
                    <div className="mt-4">
                      <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Options
                        </label>
                        <button
                          onClick={() => addOption(index)}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Add Option
                        </button>
                      </div>
                      <div className="space-y-2">
                        {field.options?.map((option, optionIndex) => (
                          <div key={optionIndex} className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={option}
                              onChange={(e) => updateOption(index, optionIndex, e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              placeholder={`Option ${optionIndex + 1}`}
                            />
                            <button
                              onClick={() => removeOption(index, optionIndex)}
                              className="px-2 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={field.multiple}
                            onChange={(e) => updateField(index, 'multiple', e.target.checked)}
                            className="mr-2"
                          />
                          <span className="text-sm font-medium text-gray-700">Allow multiple selections</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Text field specific options */}
                  {field.type === 'text' && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Validation Pattern (Regex)
                      </label>
                      <input
                        type="text"
                        value={field.pattern}
                        onChange={(e) => updateField(index, 'pattern', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., ^[A-Za-z0-9]+$"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {fields.length} field{fields.length !== 1 ? 's' : ''} configured
            </div>
            <button
              onClick={saveFields}
              disabled={saving}
              className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Fields'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}