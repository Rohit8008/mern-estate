import { useState, useEffect, useMemo } from 'react';

/**
 * DynamicCategoryFields - Renders category-specific form fields with conditional visibility
 *
 * @param {Array} fields - Array of field definitions from category
 * @param {Object} values - Current form values
 * @param {Function} onChange - Callback when a field value changes
 * @param {Object} errors - Validation errors object
 */
export default function DynamicCategoryFields({ fields = [], values = {}, onChange, errors = {} }) {
  // Group fields by their group property
  const groupedFields = useMemo(() => {
    const groups = {};
    const sortedFields = [...fields].sort((a, b) => (a.order || 0) - (b.order || 0));

    sortedFields.forEach(field => {
      const group = field.group || 'other';
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(field);
    });

    return groups;
  }, [fields]);

  // Check if a field should be visible based on showWhen condition
  const isFieldVisible = (field) => {
    if (!field.showWhen) return true;

    const { field: dependentField, values: allowedValues } = field.showWhen;
    const currentValue = values[dependentField];

    if (!currentValue) return false;

    // Handle array values (for multi-select)
    if (Array.isArray(currentValue)) {
      return currentValue.some(v => allowedValues.includes(v));
    }

    return allowedValues.includes(currentValue);
  };

  // Handle field value change
  const handleFieldChange = (fieldKey, value) => {
    onChange(fieldKey, value);
  };

  // Render a single field based on its type
  const renderField = (field) => {
    if (!isFieldVisible(field)) return null;

    const value = values[field.key] ?? field.defaultValue ?? '';
    const error = errors[field.key];
    const isRequired = field.required;

    const baseInputClass = `w-full border rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400
      focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors
      ${error ? 'border-red-500' : 'border-gray-300'}`;

    switch (field.type) {
      case 'text':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
            pattern={field.pattern || undefined}
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
        if (field.multiple) {
          // Multi-select with checkboxes
          const selectedValues = Array.isArray(value) ? value : [];
          return (
            <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {(field.options || []).map((option) => (
                  <label
                    key={option}
                    className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors
                      ${selectedValues.includes(option)
                        ? 'bg-blue-100 text-blue-800 border-2 border-blue-500'
                        : 'bg-gray-100 text-gray-700 border-2 border-transparent hover:bg-gray-200'
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedValues.includes(option)}
                      onChange={(e) => {
                        const newValues = e.target.checked
                          ? [...selectedValues, option]
                          : selectedValues.filter(v => v !== option);
                        handleFieldChange(field.key, newValues);
                      }}
                      className="sr-only"
                    />
                    <span>{option}</span>
                    {selectedValues.includes(option) && (
                      <svg className="w-4 h-4 ml-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </label>
                ))}
              </div>
              {selectedValues.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
                  {selectedValues.length} selected
                </div>
              )}
            </div>
          );
        }

        // Single select dropdown
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

  // Get group display name
  const getGroupDisplayName = (groupKey) => {
    const groupNames = {
      basic: 'Basic Details',
      area: 'Area & Size',
      features: 'Property Features',
      pricing: 'Pricing Details',
      rental: 'Rental Terms',
      amenities: 'Amenities',
      legal: 'Legal & Approvals',
      location: 'Location Details',
      food: 'Food & Meals',
      tenant: 'Tenant Preferences',
      rules: 'House Rules',
      furnishing: 'Furnishing Details',
      property: 'Property Details',
      occupants: 'Current Occupants',
      preferences: 'Preferences',
      timings: 'Operating Hours',
      other: 'Other Details',
    };
    return groupNames[groupKey] || groupKey.charAt(0).toUpperCase() + groupKey.slice(1);
  };

  // Get group icon
  const getGroupIcon = (groupKey) => {
    const icons = {
      basic: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      area: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      ),
      features: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
      pricing: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      rental: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      amenities: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      ),
      legal: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      food: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      rules: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    };
    return icons[groupKey] || icons.basic;
  };

  // Check if any field in a group is visible
  const isGroupVisible = (groupFields) => {
    return groupFields.some(field => isFieldVisible(field));
  };

  // Group order for display
  const groupOrder = ['basic', 'area', 'features', 'pricing', 'rental', 'furnishing', 'food', 'tenant', 'occupants', 'preferences', 'timings', 'amenities', 'rules', 'legal', 'location', 'property', 'other'];

  if (!fields || fields.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p>No additional fields for this category</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groupOrder.map((groupKey) => {
        const groupFields = groupedFields[groupKey];
        if (!groupFields || !isGroupVisible(groupFields)) return null;

        return (
          <div key={groupKey} className="bg-gray-50 rounded-xl p-6 border border-gray-200">
            {/* Group Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                {getGroupIcon(groupKey)}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {getGroupDisplayName(groupKey)}
                </h3>
                <p className="text-sm text-gray-500">
                  {groupFields.filter(f => isFieldVisible(f)).length} fields
                </p>
              </div>
            </div>

            {/* Group Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupFields.map((field) => {
                if (!isFieldVisible(field)) return null;

                return (
                  <div
                    key={field.key}
                    className={`${field.type === 'select' && field.multiple ? 'md:col-span-2 lg:col-span-3' : ''}`}
                  >
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                      {field.unit && <span className="text-gray-400 ml-1">({field.unit})</span>}
                    </label>

                    {renderField(field)}

                    {field.description && (
                      <p className="mt-1 text-xs text-gray-500">{field.description}</p>
                    )}

                    {errors[field.key] && (
                      <p className="mt-1 text-sm text-red-600">{errors[field.key]}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Render any remaining groups not in groupOrder */}
      {Object.keys(groupedFields)
        .filter(key => !groupOrder.includes(key))
        .map((groupKey) => {
          const groupFields = groupedFields[groupKey];
          if (!isGroupVisible(groupFields)) return null;

          return (
            <div key={groupKey} className="bg-gray-50 rounded-xl p-6 border border-gray-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600">
                  {getGroupIcon('other')}
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {getGroupDisplayName(groupKey)}
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupFields.map((field) => {
                  if (!isFieldVisible(field)) return null;

                  return (
                    <div key={field.key}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {renderField(field)}
                      {errors[field.key] && (
                        <p className="mt-1 text-sm text-red-600">{errors[field.key]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  );
}
