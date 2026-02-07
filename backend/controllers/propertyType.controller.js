import PropertyType from '../models/propertyType.model.js';
import { asyncHandler, ValidationError, NotFoundError } from '../utils/error.js';
import { config } from '../config/environment.js';
import { getCache } from '../utils/cache.js';

const CACHE_TTL_MS = (Number(config?.cache?.ttl) > 0 ? Number(config.cache.ttl) : 300) * 1000;
const MAX_CACHE_SIZE = Number(config?.cache?.maxSize) > 0 ? Number(config.cache.maxSize) : 100;
const cache = getCache({ ttlMs: CACHE_TTL_MS, maxSize: MAX_CACHE_SIZE });

function clearPropertyTypeCache() {
  cache.clearByPrefix('propertyType:');
}

export const getAllPropertyTypes = asyncHandler(async (req, res) => {
  const { includeInactive } = req.query;

  const query = { isDeleted: { $ne: true } };
  if (includeInactive !== 'true') {
    query.isActive = true;
  }

  const cacheKey = `propertyType:list:${includeInactive === 'true' ? 'all' : 'active'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.status(200).json({
      success: true,
      data: cached,
      count: cached.length,
    });
  }

  const propertyTypes = await PropertyType.find(query)
    .sort({ order: 1, name: 1 })
    .lean();

  cache.set(cacheKey, propertyTypes);

  res.status(200).json({
    success: true,
    data: propertyTypes,
    count: propertyTypes.length,
  });
});

export const getPropertyTypeBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const cacheKey = `propertyType:slug:${slug}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.status(200).json({
      success: true,
      data: cached,
    });
  }

  const propertyType = await PropertyType.findOne({ slug, isActive: true, isDeleted: { $ne: true } }).lean();

  if (!propertyType) {
    throw new NotFoundError('Property type not found');
  }

  cache.set(cacheKey, propertyType);

  res.status(200).json({
    success: true,
    data: propertyType,
  });
});

export const createPropertyType = asyncHandler(async (req, res) => {
  const { name, description, icon, category, fields, order } = req.body;

  if (!name) {
    throw new ValidationError('Property type name is required');
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const existingType = await PropertyType.findOne({ slug });
  if (existingType) {
    throw new ValidationError('Property type with this name already exists');
  }

  const propertyType = new PropertyType({
    name,
    slug,
    description: description || '',
    icon: icon || '🏠',
    category: category || 'residential',
    fields: fields || [],
    order: order || 0,
    isSystem: false,
  });

  await propertyType.save();

  clearPropertyTypeCache();

  res.status(201).json({
    success: true,
    data: propertyType,
    message: 'Property type created successfully',
  });
});

export const updatePropertyType = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, icon, category, fields, order, isActive } = req.body;

  const propertyType = await PropertyType.findById(id);
  
  if (!propertyType) {
    throw new NotFoundError('Property type not found');
  }

  if (propertyType.isSystem && name && name !== propertyType.name) {
    throw new ValidationError('Cannot rename system property types');
  }

  if (name) propertyType.name = name;
  if (description !== undefined) propertyType.description = description;
  if (icon) propertyType.icon = icon;
  if (category) propertyType.category = category;
  if (fields) propertyType.fields = fields;
  if (order !== undefined) propertyType.order = order;
  if (isActive !== undefined) propertyType.isActive = isActive;

  if (name && name !== propertyType.name) {
    propertyType.slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  await propertyType.save();

  clearPropertyTypeCache();

  res.status(200).json({
    success: true,
    data: propertyType,
    message: 'Property type updated successfully',
  });
});

export const deletePropertyType = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const propertyType = await PropertyType.findById(id);

  if (!propertyType) {
    throw new NotFoundError('Property type not found');
  }

  if (propertyType.isSystem) {
    throw new ValidationError('Cannot delete system property types');
  }

  await PropertyType.findByIdAndUpdate(id, {
    isDeleted: true,
    deletedAt: new Date(),
    deletedBy: req.user?.id || null,
  });

  clearPropertyTypeCache();

  res.status(200).json({
    success: true,
    message: 'Property type deleted successfully',
  });
});

export const seedDefaultPropertyTypes = asyncHandler(async (req, res) => {
  const defaultTypes = [
    {
      name: 'House',
      slug: 'house',
      description: 'Independent house or villa',
      icon: '🏠',
      category: 'residential',
      isSystem: true,
      order: 1,
      fields: [
        { key: 'bedrooms', label: 'Bedrooms', type: 'number', required: true, min: 1, max: 20, defaultValue: 1, order: 1, group: 'rooms' },
        { key: 'bathrooms', label: 'Bathrooms', type: 'number', required: true, min: 1, max: 20, defaultValue: 1, order: 2, group: 'rooms' },
        { key: 'floors', label: 'Number of Floors', type: 'number', required: false, min: 1, max: 10, defaultValue: 1, order: 3, group: 'structure' },
        { key: 'areaSqFt', label: 'Built-up Area', type: 'number', required: false, min: 0, unit: 'sq.ft', order: 4, group: 'dimensions' },
        { key: 'plotSize', label: 'Plot Size', type: 'text', required: false, placeholder: 'e.g., 200 sq.yd', order: 5, group: 'dimensions' },
        { key: 'furnished', label: 'Furnished', type: 'boolean', required: false, defaultValue: false, order: 6, group: 'amenities' },
        { key: 'parking', label: 'Parking Available', type: 'boolean', required: false, defaultValue: false, order: 7, group: 'amenities' },
        { key: 'garden', label: 'Garden', type: 'boolean', required: false, defaultValue: false, order: 8, group: 'amenities' },
      ],
    },
    {
      name: 'Flat',
      slug: 'flat',
      description: 'Apartment or flat in a building',
      icon: '🏢',
      category: 'residential',
      isSystem: true,
      order: 2,
      fields: [
        { key: 'bedrooms', label: 'Bedrooms', type: 'number', required: true, min: 1, max: 10, defaultValue: 1, order: 1, group: 'rooms' },
        { key: 'bathrooms', label: 'Bathrooms', type: 'number', required: true, min: 1, max: 10, defaultValue: 1, order: 2, group: 'rooms' },
        { key: 'floor', label: 'Floor Number', type: 'number', required: false, min: 0, max: 100, order: 3, group: 'location' },
        { key: 'totalFloors', label: 'Total Floors in Building', type: 'number', required: false, min: 1, max: 100, order: 4, group: 'location' },
        { key: 'areaSqFt', label: 'Carpet Area', type: 'number', required: false, min: 0, unit: 'sq.ft', order: 5, group: 'dimensions' },
        { key: 'furnished', label: 'Furnished', type: 'boolean', required: false, defaultValue: false, order: 6, group: 'amenities' },
        { key: 'parking', label: 'Parking Available', type: 'boolean', required: false, defaultValue: false, order: 7, group: 'amenities' },
        { key: 'lift', label: 'Lift Available', type: 'boolean', required: false, defaultValue: false, order: 8, group: 'amenities' },
        { key: 'balcony', label: 'Balcony', type: 'boolean', required: false, defaultValue: false, order: 9, group: 'amenities' },
      ],
    },
    {
      name: 'Plot',
      slug: 'plot',
      description: 'Land or plot for construction',
      icon: '📐',
      category: 'land',
      isSystem: true,
      order: 3,
      fields: [
        { key: 'sqYard', label: 'Area in Sq. Yards', type: 'number', required: true, min: 0, unit: 'sq.yd', order: 1, group: 'dimensions' },
        { key: 'sqYardRate', label: 'Rate per Sq. Yard', type: 'number', required: false, min: 0, unit: '₹', order: 2, group: 'pricing' },
        { key: 'plotType', label: 'Plot Type', type: 'select', required: false, options: ['Residential', 'Commercial', 'Agricultural', 'Industrial'], order: 3, group: 'details' },
        { key: 'facing', label: 'Facing Direction', type: 'select', required: false, options: ['North', 'South', 'East', 'West', 'North-East', 'North-West', 'South-East', 'South-West'], order: 4, group: 'details' },
        { key: 'boundaryWall', label: 'Boundary Wall', type: 'boolean', required: false, defaultValue: false, order: 5, group: 'features' },
        { key: 'cornerPlot', label: 'Corner Plot', type: 'boolean', required: false, defaultValue: false, order: 6, group: 'features' },
        { key: 'gatedCommunity', label: 'Gated Community', type: 'boolean', required: false, defaultValue: false, order: 7, group: 'features' },
      ],
    },
    {
      name: 'Factory',
      slug: 'factory',
      description: 'Industrial factory or manufacturing unit',
      icon: '🏭',
      category: 'industrial',
      isSystem: true,
      order: 4,
      fields: [
        { key: 'areaSqFt', label: 'Built-up Area', type: 'number', required: true, min: 0, unit: 'sq.ft', order: 1, group: 'dimensions' },
        { key: 'plotSize', label: 'Total Plot Size', type: 'text', required: false, placeholder: 'e.g., 5000 sq.yd', order: 2, group: 'dimensions' },
        { key: 'powerLoad', label: 'Power Load', type: 'text', required: false, placeholder: 'e.g., 100 KW', order: 3, group: 'utilities' },
        { key: 'ceilingHeight', label: 'Ceiling Height', type: 'number', required: false, min: 0, unit: 'ft', order: 4, group: 'structure' },
        { key: 'dockingBays', label: 'Number of Docking Bays', type: 'number', required: false, min: 0, order: 5, group: 'facilities' },
        { key: 'parking', label: 'Parking Available', type: 'boolean', required: false, defaultValue: false, order: 6, group: 'amenities' },
        { key: 'officeSpace', label: 'Office Space Included', type: 'boolean', required: false, defaultValue: false, order: 7, group: 'amenities' },
      ],
    },
    {
      name: 'Shop',
      slug: 'shop',
      description: 'Commercial shop or retail space',
      icon: '🏪',
      category: 'commercial',
      isSystem: true,
      order: 5,
      fields: [
        { key: 'areaSqFt', label: 'Shop Area', type: 'number', required: true, min: 0, unit: 'sq.ft', order: 1, group: 'dimensions' },
        { key: 'floor', label: 'Floor Number', type: 'number', required: false, min: 0, max: 50, order: 2, group: 'location' },
        { key: 'frontage', label: 'Frontage Width', type: 'number', required: false, min: 0, unit: 'ft', order: 3, group: 'dimensions' },
        { key: 'washroom', label: 'Washroom Available', type: 'boolean', required: false, defaultValue: false, order: 4, group: 'amenities' },
        { key: 'parking', label: 'Parking Available', type: 'boolean', required: false, defaultValue: false, order: 5, group: 'amenities' },
        { key: 'cornerShop', label: 'Corner Shop', type: 'boolean', required: false, defaultValue: false, order: 6, group: 'features' },
        { key: 'mainRoadFacing', label: 'Main Road Facing', type: 'boolean', required: false, defaultValue: false, order: 7, group: 'features' },
      ],
    },
    {
      name: 'Office',
      slug: 'office',
      description: 'Commercial office space',
      icon: '🏢',
      category: 'commercial',
      isSystem: true,
      order: 6,
      fields: [
        { key: 'areaSqFt', label: 'Office Area', type: 'number', required: true, min: 0, unit: 'sq.ft', order: 1, group: 'dimensions' },
        { key: 'cabins', label: 'Number of Cabins', type: 'number', required: false, min: 0, order: 2, group: 'layout' },
        { key: 'workstations', label: 'Number of Workstations', type: 'number', required: false, min: 0, order: 3, group: 'layout' },
        { key: 'meetingRooms', label: 'Meeting Rooms', type: 'number', required: false, min: 0, order: 4, group: 'layout' },
        { key: 'floor', label: 'Floor Number', type: 'number', required: false, min: 0, max: 100, order: 5, group: 'location' },
        { key: 'furnished', label: 'Furnished', type: 'boolean', required: false, defaultValue: false, order: 6, group: 'amenities' },
        { key: 'parking', label: 'Parking Available', type: 'boolean', required: false, defaultValue: false, order: 7, group: 'amenities' },
        { key: 'lift', label: 'Lift Available', type: 'boolean', required: false, defaultValue: false, order: 8, group: 'amenities' },
        { key: 'cafeteria', label: 'Cafeteria', type: 'boolean', required: false, defaultValue: false, order: 9, group: 'amenities' },
      ],
    },
  ];

  const results = [];
  for (const typeData of defaultTypes) {
    const existing = await PropertyType.findOne({ slug: typeData.slug });
    if (!existing) {
      const propertyType = new PropertyType(typeData);
      await propertyType.save();
      results.push(propertyType);
    }
  }

  clearPropertyTypeCache();

  res.status(200).json({
    success: true,
    message: `Seeded ${results.length} default property types`,
    data: results,
  });
});
