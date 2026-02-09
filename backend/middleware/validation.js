import Joi from 'joi';

export const validateBody = (schema) => {
  return (req, res, next) => {
    try {
      const { error, value } = schema.validate(req.body, {
        abortEarly: true,
        stripUnknown: true,
      });

      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details?.[0]?.message || 'Validation failed',
        });
      }

      req.body = value;
      return next();
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
      });
    }
  };
};

// Owner validation schemas
export const ownerValidation = {
  create: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().max(254).optional().allow(''),
    phone: Joi.string().max(30).optional().allow(''),
    companyName: Joi.string().max(100).optional().allow(''),
    addressLine1: Joi.string().max(100).optional().allow(''),
    addressLine2: Joi.string().max(100).optional().allow(''),
    city: Joi.string().max(60).optional().allow(''),
    state: Joi.string().max(60).optional().allow(''),
    postalCode: Joi.string().max(20).optional().allow(''),
    country: Joi.string().max(60).optional().allow(''),
    taxId: Joi.string().max(60).optional().allow(''),
    notes: Joi.string().max(1000).optional().allow(''),
    active: Joi.boolean().optional(),
  }),

  update: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    email: Joi.string().email().max(254).optional().allow(''),
    phone: Joi.string().max(30).optional().allow(''),
    companyName: Joi.string().max(100).optional().allow(''),
    addressLine1: Joi.string().max(100).optional().allow(''),
    addressLine2: Joi.string().max(100).optional().allow(''),
    city: Joi.string().max(60).optional().allow(''),
    state: Joi.string().max(60).optional().allow(''),
    postalCode: Joi.string().max(20).optional().allow(''),
    country: Joi.string().max(60).optional().allow(''),
    taxId: Joi.string().max(60).optional().allow(''),
    notes: Joi.string().max(1000).optional().allow(''),
    active: Joi.boolean().optional(),
  }),
};

// Client validation schemas
export const clientValidation = {
  create: Joi.object({
    name: Joi.string().min(2).max(120).required(),
    email: Joi.string().email().max(254).optional().allow(''),
    phone: Joi.string().max(30).optional().allow(''),
    status: Joi.string().valid('lead', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost').optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
    notes: Joi.string().max(2000).optional().allow(''),
    tags: Joi.array().items(Joi.string().max(40)).max(50).optional(),
    source: Joi.string().max(100).optional().allow(''),
    interestedListings: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).max(200).optional(),
    assignedTo: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
    organization: Joi.string().max(120).optional().allow(''),
    lastContactAt: Joi.date().iso().optional().allow(null, ''),
  }),

  update: Joi.object({
    name: Joi.string().min(2).max(120).optional(),
    email: Joi.string().email().max(254).optional().allow(''),
    phone: Joi.string().max(30).optional().allow(''),
    status: Joi.string().valid('lead', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost').optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
    notes: Joi.string().max(2000).optional().allow(''),
    tags: Joi.array().items(Joi.string().max(40)).max(50).optional(),
    source: Joi.string().max(100).optional().allow(''),
    interestedListings: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).max(200).optional(),
    assignedTo: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
    organization: Joi.string().max(120).optional().allow(''),
    lastContactAt: Joi.date().iso().optional().allow(null, ''),
  }),

  assign: Joi.object({
    assignedTo: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  }),

  interestedListing: Joi.object({
    listingId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  }),
};

// Task validation schemas
export const taskValidation = {
  create: Joi.object({
    title: Joi.string().min(2).max(200).required(),
    description: Joi.string().max(2000).optional().allow(''),
    dueAt: Joi.date().iso().optional().allow(null, ''),
    status: Joi.string().valid('todo', 'in_progress', 'done', 'blocked').optional(),
    priority: Joi.string().valid('low', 'medium', 'high').optional(),
    assignedTo: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
    related: Joi.object({
      kind: Joi.string().valid('client', 'listing', 'none').optional(),
      clientId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null, ''),
      listingId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null, ''),
    }).optional(),
    reminders: Joi.array().items(Joi.object({
      at: Joi.date().iso().required(),
      sent: Joi.boolean().optional(),
    }).unknown(false)).max(20).optional(),
  }),

  update: Joi.object({
    title: Joi.string().min(2).max(200).optional(),
    description: Joi.string().max(2000).optional().allow(''),
    dueAt: Joi.date().iso().optional().allow(null, ''),
    status: Joi.string().valid('todo', 'in_progress', 'done', 'blocked').optional(),
    priority: Joi.string().valid('low', 'medium', 'high').optional(),
    assignedTo: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
    related: Joi.object({
      kind: Joi.string().valid('client', 'listing', 'none').optional(),
      clientId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null, ''),
      listingId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null, ''),
    }).optional(),
    reminders: Joi.array().items(Joi.object({
      at: Joi.date().iso().required(),
      sent: Joi.boolean().optional(),
    }).unknown(false)).max(20).optional(),
  }),
};

// Role validation schemas
export const roleValidation = {
  create: Joi.object({
    name: Joi.string().min(2).max(60).required(),
    description: Joi.string().max(500).optional().allow(''),
    permissions: Joi.object().unknown(true).optional(),
  }),

  update: Joi.object({
    name: Joi.string().min(2).max(60).optional(),
    description: Joi.string().max(500).optional().allow(''),
    permissions: Joi.object().unknown(true).optional(),
    isActive: Joi.boolean().optional(),
  }),

  assign: Joi.object({
    userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    roleId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  }),

  remove: Joi.object({
    userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  }),
};

// CRM validation schemas
export const crmValidation = {
  addDeal: Joi.object({
    listingId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null, ''),
    stage: Joi.string().max(50).optional(),
    value: Joi.number().min(0).optional(),
    expectedCloseDate: Joi.date().iso().optional().allow(null, ''),
    notes: Joi.string().max(2000).optional().allow(''),
    commissionPercentage: Joi.number().min(0).max(100).optional(),
  }),

  updateDealStage: Joi.object({
    stage: Joi.string().max(50).required(),
    notes: Joi.string().max(2000).optional().allow(''),
  }),

  updateCommission: Joi.object({
    percentage: Joi.number().min(0).max(100).optional(),
    amount: Joi.number().min(0).optional(),
    status: Joi.string().valid('pending', 'partial', 'paid').optional(),
  }),

  addFollowUp: Joi.object({
    dueAt: Joi.date().iso().required(),
    type: Joi.string().valid('call', 'email', 'meeting', 'site_visit', 'whatsapp', 'other').optional(),
    notes: Joi.string().max(2000).optional().allow(''),
  }),

  completeFollowUp: Joi.object({
    notes: Joi.string().max(2000).optional().allow(''),
  }),

  addCommunication: Joi.object({
    type: Joi.string().valid('call', 'email', 'sms', 'meeting', 'whatsapp', 'site_visit', 'note').required(),
    direction: Joi.string().valid('inbound', 'outbound').optional(),
    summary: Joi.string().min(2).max(500).required(),
    details: Joi.string().max(5000).optional().allow(''),
    duration: Joi.number().min(0).max(100000).optional(),
    outcome: Joi.string().max(200).optional().allow(''),
  }),
};

// Newsletter/subscriber validation
export const subscriberValidation = {
  subscribe: Joi.object({
    email: Joi.string().email().max(254).required(),
    name: Joi.string().max(80).optional().allow(''),
    source: Joi.string().max(80).optional().allow(''),
  }),
};

// Listing admin action validations
export const listingActionValidation = {
  assignAgent: Joi.object({
    listingId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
    agentId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  }),

  unassignAgent: Joi.object({
    listingId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  }),

  bulkImport: Joi.object({
    listings: Joi.array().items(Joi.object().unknown(true)).min(1).max(100).required(),
  }),
};

// Property type validation schemas
export const propertyTypeValidation = {
  create: Joi.object({
    name: Joi.string().min(2).max(60).required(),
    description: Joi.string().max(500).optional().allow(''),
    icon: Joi.string().max(20).optional().allow(''),
    category: Joi.string().valid('residential', 'commercial', 'land', 'industrial', 'other').optional(),
    fields: Joi.array().items(Joi.object().unknown(true)).max(200).optional(),
    order: Joi.number().integer().min(0).max(10000).optional(),
  }),

  update: Joi.object({
    name: Joi.string().min(2).max(60).optional(),
    description: Joi.string().max(500).optional().allow(''),
    icon: Joi.string().max(20).optional().allow(''),
    category: Joi.string().valid('residential', 'commercial', 'land', 'industrial', 'other').optional(),
    fields: Joi.array().items(Joi.object().unknown(true)).max(200).optional(),
    order: Joi.number().integer().min(0).max(10000).optional(),
    isActive: Joi.boolean().optional(),
  }),
};

export const userRouteValidation = {
  updateProfile: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).optional(),
    firstName: Joi.string().max(50).optional().allow(''),
    lastName: Joi.string().max(50).optional().allow(''),
    avatar: Joi.string().uri().optional().allow(''),
    phone: Joi.string().max(30).optional().allow(''),
    addressLine1: Joi.string().max(100).optional().allow(''),
    addressLine2: Joi.string().max(100).optional().allow(''),
    city: Joi.string().max(60).optional().allow(''),
    state: Joi.string().max(60).optional().allow(''),
    postalCode: Joi.string().max(20).optional().allow(''),
    country: Joi.string().max(60).optional().allow(''),
    bio: Joi.string().max(500).optional().allow(''),
  }),

  createEmployee: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    firstName: Joi.string().max(50).optional().allow(''),
    lastName: Joi.string().max(50).optional().allow(''),
    email: Joi.string().email().max(254).required(),
    password: Joi.string().min(8).max(128).required(),
    assignedCategories: Joi.array().items(Joi.string().max(100)).max(200).optional(),
    phone: Joi.string().max(30).optional().allow(''),
  }),

  adminSetEmployeePassword: Joi.object({
    newPassword: Joi.string().min(8).max(128).required(),
  }),

  adminToggleUserStatus: Joi.object({
    status: Joi.string().valid('active', 'inactive').required(),
  }),

  requestPasswordOtp: Joi.object({
    email: Joi.string().email().max(254).required(),
  }),

  resetPasswordWithOtp: Joi.object({
    email: Joi.string().email().max(254).required(),
    otp: Joi.string().pattern(/^\d{6}$/).required(),
    newPassword: Joi.string().min(8).max(128).required(),
  }),

  setUserRole: Joi.object({
    role: Joi.string().valid('user', 'buyer', 'employee', 'admin').required(),
    assignedCategories: Joi.array().items(Joi.string().max(100)).max(200).optional(),
  }),
};

// User validation schemas
export const userValidation = {
  register: Joi.object({
    username: Joi.string()
      .alphanum()
      .min(3)
      .max(30)
      .required()
      .messages({
        'string.alphanum': 'Username must contain only alphanumeric characters',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username cannot exceed 30 characters',
        'any.required': 'Username is required',
      }),
    email: Joi.string()
      .email()
      .max(254)
      .required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'string.max': 'Email cannot exceed 254 characters',
        'any.required': 'Email is required',
      }),
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters long',
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
        'any.required': 'Password is required',
      }),
    avatar: Joi.string()
      .uri()
      .optional()
      .messages({
        'string.uri': 'Avatar must be a valid URL',
      }),
  }),

  login: Joi.object({
    email: Joi.string()
      .email()
      .required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required',
      }),
    password: Joi.string()
      .required()
      .messages({
        'any.required': 'Password is required',
      }),
  }),

  update: Joi.object({
    username: Joi.string()
      .alphanum()
      .min(3)
      .max(30)
      .optional()
      .messages({
        'string.alphanum': 'Username must contain only alphanumeric characters',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username cannot exceed 30 characters',
      }),
    email: Joi.string()
      .email()
      .max(254)
      .optional()
      .messages({
        'string.email': 'Please provide a valid email address',
        'string.max': 'Email cannot exceed 254 characters',
      }),
    avatar: Joi.string()
      .uri()
      .optional()
      .messages({
        'string.uri': 'Avatar must be a valid URL',
      }),
  }),
};

// Listing validation schemas
export const listingValidation = {
  create: Joi.object({
    name: Joi.string()
      .min(3)
      .max(100)
      .required()
      .messages({
        'string.min': 'Property name must be at least 3 characters long',
        'string.max': 'Property name cannot exceed 100 characters',
        'any.required': 'Property name is required',
      }),
    description: Joi.string()
      .min(10)
      .max(2000)
      .optional()
      .messages({
        'string.min': 'Description must be at least 10 characters long',
        'string.max': 'Description cannot exceed 2000 characters',
      }),
    address: Joi.string()
      .min(5)
      .max(200)
      .required()
      .messages({
        'string.min': 'Address must be at least 5 characters long',
        'string.max': 'Address cannot exceed 200 characters',
        'any.required': 'Address is required',
      }),
    regularPrice: Joi.number()
      .positive()
      .max(1000000000)
      .required()
      .messages({
        'number.positive': 'Price must be a positive number',
        'number.max': 'Price cannot exceed 1 billion',
        'any.required': 'Price is required',
      }),
    discountPrice: Joi.number()
      .positive()
      .max(1000000000)
      .optional()
      .messages({
        'number.positive': 'Discount price must be a positive number',
        'number.max': 'Discount price cannot exceed 1 billion',
      }),
    bathrooms: Joi.number()
      .integer()
      .min(1)
      .max(20)
      .required()
      .messages({
        'number.integer': 'Bathrooms must be a whole number',
        'number.min': 'Must have at least 1 bathroom',
        'number.max': 'Cannot have more than 20 bathrooms',
        'any.required': 'Number of bathrooms is required',
      }),
    bedrooms: Joi.number()
      .integer()
      .min(1)
      .max(20)
      .required()
      .messages({
        'number.integer': 'Bedrooms must be a whole number',
        'number.min': 'Must have at least 1 bedroom',
        'number.max': 'Cannot have more than 20 bedrooms',
        'any.required': 'Number of bedrooms is required',
      }),
    furnished: Joi.boolean()
      .optional(),
    parking: Joi.boolean()
      .optional(),
    type: Joi.string()
      .valid('sale', 'rent')
      .required()
      .messages({
        'any.only': 'Type must be either "sale" or "rent"',
        'any.required': 'Property type is required',
      }),
    offer: Joi.boolean()
      .optional(),
    imageUrls: Joi.array()
      .items(Joi.string().uri())
      .min(1)
      .max(10)
      .required()
      .messages({
        'array.min': 'At least one image is required',
        'array.max': 'Cannot upload more than 10 images',
        'any.required': 'Images are required',
      }),
    category: Joi.string().max(100).optional().allow(''),
    attributes: Joi.object().unknown(true).optional(),
    ownerIds: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).max(50).optional(),
    city: Joi.string().max(100).optional().allow(''),
    locality: Joi.string().max(100).optional().allow(''),
    areaSqFt: Joi.number().min(0).optional(),
    status: Joi.string().valid('available', 'sold', 'under_negotiation').optional(),
    assignedAgent: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null, ''),
    propertyCategory: Joi.string().valid('residential', 'commercial', 'land', 'unknown').optional(),
    propertyType: Joi.string().max(50).optional().allow(''),
    commercialType: Joi.string().max(50).optional().allow(''),
    plotType: Joi.string().max(50).optional().allow(''),
    location: Joi.object({
      lat: Joi.number().min(-90).max(90).optional().allow(null),
      lng: Joi.number().min(-180).max(180).optional().allow(null),
    }).optional(),
  }),

  update: Joi.object({
    name: Joi.string()
      .min(3)
      .max(100)
      .optional(),
    description: Joi.string()
      .min(10)
      .max(2000)
      .optional(),
    address: Joi.string()
      .min(5)
      .max(200)
      .optional(),
    regularPrice: Joi.number()
      .positive()
      .max(1000000000)
      .optional(),
    discountPrice: Joi.number()
      .positive()
      .max(1000000000)
      .optional(),
    bathrooms: Joi.number()
      .integer()
      .min(1)
      .max(20)
      .optional(),
    bedrooms: Joi.number()
      .integer()
      .min(1)
      .max(20)
      .optional(),
    furnished: Joi.boolean()
      .optional(),
    parking: Joi.boolean()
      .optional(),
    type: Joi.string()
      .valid('sale', 'rent')
      .optional(),
    offer: Joi.boolean()
      .optional(),
    imageUrls: Joi.array()
      .items(Joi.string().uri())
      .min(1)
      .max(10)
      .optional(),
    category: Joi.string().max(100).optional().allow(''),
    attributes: Joi.object().unknown(true).optional(),
    ownerIds: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).max(50).optional(),
    city: Joi.string().max(100).optional().allow(''),
    locality: Joi.string().max(100).optional().allow(''),
    areaSqFt: Joi.number().min(0).optional(),
    status: Joi.string().valid('available', 'sold', 'under_negotiation').optional(),
    assignedAgent: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null, ''),
    propertyCategory: Joi.string().valid('residential', 'commercial', 'land', 'unknown').optional(),
    propertyType: Joi.string().max(50).optional().allow(''),
    commercialType: Joi.string().max(50).optional().allow(''),
    plotType: Joi.string().max(50).optional().allow(''),
    location: Joi.object({
      lat: Joi.number().min(-90).max(90).optional().allow(null),
      lng: Joi.number().min(-180).max(180).optional().allow(null),
    }).optional(),
  }),
};

// Buyer requirement validation schemas
export const buyerRequirementValidation = {
  create: Joi.object({
    buyerName: Joi.string()
      .min(2)
      .max(100)
      .required()
      .messages({
        'string.min': 'Buyer name must be at least 2 characters long',
        'string.max': 'Buyer name cannot exceed 100 characters',
        'any.required': 'Buyer name is required',
      }),
    buyerEmail: Joi.string()
      .email()
      .max(254)
      .optional()
      .allow('')
      .messages({
        'string.email': 'Please provide a valid email address',
        'string.max': 'Email cannot exceed 254 characters',
      }),
    buyerPhone: Joi.string()
      .pattern(/^[\+]?[1-9][\d]{0,15}$/)
      .required()
      .messages({
        'string.pattern.base': 'Please provide a valid phone number',
        'any.required': 'Buyer phone is required',
      }),
    preferredLocation: Joi.string()
      .max(200)
      .optional()
      .allow('')
      .messages({
        'string.max': 'Location cannot exceed 200 characters',
      }),
    propertyType: Joi.string()
      .valid('sale', 'rent')
      .required()
      .messages({
        'any.only': 'Property type must be either "sale" or "rent"',
        'any.required': 'Property type is required',
      }),
    minPrice: Joi.number()
      .min(0)
      .max(1000000000)
      .optional()
      .allow('', null)
      .messages({
        'number.min': 'Minimum price cannot be negative',
        'number.max': 'Minimum price cannot exceed 1 billion',
      }),
    maxPrice: Joi.number()
      .min(0)
      .max(1000000000)
      .optional()
      .allow('', null)
      .messages({
        'number.min': 'Maximum price cannot be negative',
        'number.max': 'Maximum price cannot exceed 1 billion',
      }),
    minBedrooms: Joi.number()
      .integer()
      .min(0)
      .max(20)
      .optional()
      .allow('', null)
      .messages({
        'number.integer': 'Bedrooms must be a whole number',
        'number.min': 'Bedrooms cannot be negative',
        'number.max': 'Cannot have more than 20 bedrooms',
      }),
    minBathrooms: Joi.number()
      .integer()
      .min(0)
      .max(20)
      .optional()
      .allow('', null)
      .messages({
        'number.integer': 'Bathrooms must be a whole number',
        'number.min': 'Bathrooms cannot be negative',
        'number.max': 'Cannot have more than 20 bathrooms',
      }),
    preferredArea: Joi.string()
      .max(200)
      .optional()
      .messages({
        'string.max': 'Area cannot exceed 200 characters',
      }),
    additionalRequirements: Joi.string()
      .max(1000)
      .optional()
      .messages({
        'string.max': 'Additional requirements cannot exceed 1000 characters',
      }),
    budget: Joi.string()
      .max(100)
      .optional()
      .messages({
        'string.max': 'Budget cannot exceed 100 characters',
      }),
    timeline: Joi.string()
      .max(100)
      .optional()
      .messages({
        'string.max': 'Timeline cannot exceed 100 characters',
      }),
    notes: Joi.string()
      .max(500)
      .optional()
      .messages({
        'string.max': 'Notes cannot exceed 500 characters',
      }),
  }),

  update: Joi.object({
    buyerName: Joi.string()
      .min(2)
      .max(100)
      .optional(),
    buyerEmail: Joi.string()
      .email()
      .max(254)
      .optional()
      .allow(''),
    buyerPhone: Joi.string()
      .pattern(/^[\+]?[1-9][\d]{0,15}$/)
      .optional(),
    preferredLocation: Joi.string()
      .max(200)
      .optional()
      .allow(''),
    propertyType: Joi.string()
      .valid('sale', 'rent')
      .optional(),
    minPrice: Joi.number()
      .min(0)
      .max(1000000000)
      .optional()
      .allow('', null),
    maxPrice: Joi.number()
      .min(0)
      .max(1000000000)
      .optional()
      .allow('', null),
    minBedrooms: Joi.number()
      .integer()
      .min(0)
      .max(20)
      .optional()
      .allow('', null),
    minBathrooms: Joi.number()
      .integer()
      .min(0)
      .max(20)
      .optional()
      .allow('', null),
    preferredArea: Joi.string()
      .max(200)
      .optional(),
    additionalRequirements: Joi.string()
      .max(1000)
      .optional(),
    budget: Joi.string()
      .max(100)
      .optional(),
    timeline: Joi.string()
      .max(100)
      .optional(),
    notes: Joi.string()
      .max(500)
      .optional(),
    status: Joi.string()
      .valid('active', 'matched', 'closed', 'inactive')
      .optional(),
    priority: Joi.string()
      .valid('low', 'medium', 'high')
      .optional(),
  }),
};

// Message validation schemas
export const messageValidation = {
  send: Joi.object({
    content: Joi.string()
      .min(1)
      .max(1000)
      .required()
      .messages({
        'string.min': 'Message cannot be empty',
        'string.max': 'Message cannot exceed 1000 characters',
        'any.required': 'Message content is required',
      }),
    receiverId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid receiver ID',
        'any.required': 'Receiver is required',
      }),
    listingId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(''),
  }),

  markRead: Joi.object({
    otherId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid otherId',
        'any.required': 'otherId is required',
      }),
  }),
};

// Category validation schemas
export const categoryValidation = {
  create: Joi.object({
    name: Joi.string()
      .min(2)
      .max(50)
      .required()
      .messages({
        'string.min': 'Category name must be at least 2 characters long',
        'string.max': 'Category name cannot exceed 50 characters',
        'any.required': 'Category name is required',
      }),
    fields: Joi.array().items(Joi.object().unknown(true)).max(200).optional(),
  }),

  updateFields: Joi.object({
    fields: Joi.array().items(Joi.object().unknown(true)).max(200).required().messages({
      'any.required': 'fields is required',
    }),
  }),
};

// Search validation
export const searchValidation = {
  query: Joi.object({
    searchTerm: Joi.string()
      .max(100)
      .optional()
      .messages({
        'string.max': 'Search term cannot exceed 100 characters',
      }),
    type: Joi.string()
      .valid('sale', 'rent')
      .optional(),
    offer: Joi.boolean()
      .optional(),
    furnished: Joi.boolean()
      .optional(),
    parking: Joi.boolean()
      .optional(),
    sort: Joi.string()
      .valid('createdAt', 'regularPrice', 'name')
      .optional(),
    order: Joi.string()
      .valid('asc', 'desc')
      .optional(),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(50)
      .optional()
      .messages({
        'number.integer': 'Limit must be a whole number',
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 50',
      }),
    startIndex: Joi.number()
      .integer()
      .min(0)
      .optional()
      .messages({
        'number.integer': 'Start index must be a whole number',
        'number.min': 'Start index cannot be negative',
      }),
  }),
};

// Buyer Requirement validation
export const validateBuyerRequirement = (req, res, next) => {
  const schema = Joi.object({
    buyerName: Joi.string()
      .min(3)
      .max(100)
      .required()
      .messages({
        'string.min': 'Buyer name must be at least 3 characters',
        'string.max': 'Buyer name cannot exceed 100 characters',
        'any.required': 'Buyer name is required',
      }),
    email: Joi.string()
      .email()
      .optional()
      .allow('')
      .messages({
        'string.email': 'Please provide a valid email address',
      }),
    phone: Joi.string()
      .pattern(/^\+?\d{10,15}$/)
      .optional()
      .allow('')
      .messages({
        'string.pattern.base': 'Please provide a valid phone number',
      }),
    propertyType: Joi.string()
      .valid('sale', 'rent')
      .default('sale')
      .messages({
        'any.only': 'Property type must be either "sale" or "rent"',
      }),
    location: Joi.string()
      .max(200)
      .optional()
      .allow('')
      .messages({
        'string.max': 'Location cannot exceed 200 characters',
      }),
    minPrice: Joi.number()
      .min(0)
      .optional()
      .messages({
        'number.min': 'Minimum price cannot be negative',
      }),
    maxPrice: Joi.number()
      .min(Joi.ref('minPrice'))
      .optional()
      .messages({
        'number.min': 'Maximum price must be greater than or equal to minimum price',
      }),
    minBedrooms: Joi.number()
      .min(0)
      .max(20)
      .optional()
      .messages({
        'number.min': 'Minimum bedrooms cannot be negative',
        'number.max': 'Minimum bedrooms cannot exceed 20',
      }),
    minBathrooms: Joi.number()
      .min(0)
      .max(20)
      .optional()
      .messages({
        'number.min': 'Minimum bathrooms cannot be negative',
        'number.max': 'Minimum bathrooms cannot exceed 20',
      }),
    minArea: Joi.number()
      .min(0)
      .optional()
      .messages({
        'number.min': 'Minimum area cannot be negative',
      }),
    maxArea: Joi.number()
      .min(Joi.ref('minArea'))
      .optional()
      .messages({
        'number.min': 'Maximum area must be greater than or equal to minimum area',
      }),
    preferredMoveInDate: Joi.date()
      .iso()
      .optional()
      .allow('')
      .messages({
        'date.format': 'Please provide a valid date',
      }),
    status: Joi.string()
      .valid('active', 'matched', 'closed', 'inactive')
      .default('active')
      .messages({
        'any.only': 'Status must be one of: active, matched, closed, inactive',
      }),
    notes: Joi.string()
      .max(500)
      .optional()
      .allow('')
      .messages({
        'string.max': 'Notes cannot exceed 500 characters',
      }),
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
    });
  }
  next();
};
