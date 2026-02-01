import { useMemo } from 'react';

export default function PropertyTypeFields({ fields = [], values = {}, onChange, errors = {} }) {
  const groupedFields = useMemo(() => {
    const groups = {};
    const sortedFields = [...fields].sort((a, b) => (a.order || 0) - (b.order || 0));

    sortedFields.forEach(field => {
      const group = field.group || 'general';
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(field);
    });

    return groups;
  }, [fields]);

  const handleFieldChange = (fieldKey, value) => {
    onChange(fieldKey, value);
  };

  const renderField = (field) => {
    const value = values[field.key] ?? field.defaultValue ?? '';
    const fieldError = errors[field.key];
    const isRequired = field.required;

    const baseInputClass = `w-full border rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400
      focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors
      ${fieldError ? 'border-red-500' : 'border-gray-300'}`;

    switch (field.type) {
      case 'text':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
            className={baseInputClass}
            required={isRequired}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
            rows={4}
            className={`${baseInputClass} resize-none`}
            required={isRequired}
          />
        );

      case 'number':
        return (
          <div className="relative">
            <input
              type="number"
              value={value}
              onChange={(e) => handleFieldChange(field.key, e.target.value ? Number(e.target.value) : '')}
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              min={field.min}
              max={field.max}
              className={`${baseInputClass} ${field.unit ? 'pr-16' : ''}`}
              required={isRequired}
            />
            {field.unit && (
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                {field.unit}
              </span>
            )}
          </div>
        );

      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            className={baseInputClass}
            required={isRequired}
          >
            <option value="">Select {field.label}</option>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case 'boolean':
        return (
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                name={field.key}
                checked={value === true}
                onChange={() => handleFieldChange(field.key, true)}
                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className="ml-2 text-gray-700">Yes</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                name={field.key}
                checked={value === false}
                onChange={() => handleFieldChange(field.key, false)}
                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className="ml-2 text-gray-700">No</span>
            </label>
          </div>
        );

      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            className={baseInputClass}
            required={isRequired}
          />
        );

      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
            className={baseInputClass}
            required={isRequired}
          />
        );
    }
  };

  const groupTitles = {
    rooms: 'Rooms & Layout',
    dimensions: 'Dimensions',
    amenities: 'Amenities & Features',
    structure: 'Structure',
    location: 'Location Details',
    pricing: 'Pricing',
    details: 'Property Details',
    features: 'Features',
    utilities: 'Utilities',
    facilities: 'Facilities',
    layout: 'Layout',
    general: 'General Information',
  };

  return (
    <div className='space-y-6'>
      {Object.entries(groupedFields).map(([groupName, groupFields]) => (
        <div key={groupName} className='bg-gray-50 rounded-lg p-6 border border-gray-200'>
          <h3 className='text-lg font-semibold text-gray-900 mb-4'>
            {groupTitles[groupName] || groupName.charAt(0).toUpperCase() + groupName.slice(1)}
          </h3>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {groupFields.map((field) => {
              const fieldError = errors[field.key];
              return (
                <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                  <label className='block text-sm font-medium text-gray-700 mb-2'>
                    {field.label}
                    {field.required && <span className='text-red-500 ml-1'>*</span>}
                  </label>
                  {renderField(field)}
                  {field.helpText && (
                    <p className='text-xs text-gray-500 mt-1'>{field.helpText}</p>
                  )}
                  {fieldError && (
                    <p className='text-xs text-red-500 mt-1'>{fieldError}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
