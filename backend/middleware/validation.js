import Joi from 'joi';
import { ValidationError } from '../utils/error.js';

/**
 * Validate the body against a Joi schema, and answer a failure in the same
 * shape as every other error (utils/error.js) — it used to be a bare
 * `{ success, message }` with no field, so a form could not say which input
 * was wrong. Unknown keys are stripped, so a client cannot smuggle fields the
 * schema does not name into a write.
 */
export const validateBody = (schema) => {
  // Named, so tests/validationCoverage.test.js can find it on a route's stack,
  // and carrying its schema, so utils/openapi.js can document the body from
  // the same definition that enforces it — docs that cannot drift.
  const middleware = function validateBody(req, res, next) {
    const { error, value } = schema.validate(req.body ?? {}, {
      abortEarly: true,
      stripUnknown: true,
    });

    if (error) {
      const detail = error.details?.[0];
      return next(new ValidationError(
        detail?.message?.replace(/"/g, '') || 'Validation failed',
        detail?.path?.join('.') || null
      ));
    }

    req.body = value;
    return next();
  };
  middleware.schema = schema;
  return middleware;
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
  /**
   * A bulk action names the records, the action and (for most actions) a value.
   * The id list is capped here as well as in the controller so an oversized
   * body is rejected before it is parsed into memory.
   */
  bulk: Joi.object({
    ids: Joi.array().items(Joi.string().hex().length(24)).min(1).max(500).required(),
    action: Joi.string().valid('assign', 'status', 'delete', 'tag', 'untag').required(),
    value: Joi.string().max(60).optional().allow('', null),
  }),

  create: Joi.object({
    name: Joi.string().min(2).max(120).required(),
    email: Joi.string().email().max(254).optional().allow(''),
    phone: Joi.string().max(30).optional().allow(''),
    alternatePhone: Joi.string().max(30).optional().allow(''),
    status: Joi.string().valid('lead', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost').optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional().allow(''),
    temperature: Joi.string().valid('hot', 'warm', 'cold').optional(),
    notes: Joi.string().max(2000).optional().allow(''),
    requirements: Joi.string().max(2000).optional().allow(''),
    tags: Joi.array().items(Joi.string().max(40)).max(50).optional(),
    contactType: Joi.string().valid('lead', 'co_agent', 'referral_partner').optional(),
    source: Joi.string().max(100).optional().allow(''),
    organization: Joi.string().max(120).optional().allow(''),
    interestedListings: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).max(200).optional(),
    assignedTo: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
    lastContactAt: Joi.date().iso().optional().allow(null, ''),
    propertyType: Joi.string().max(50).optional().allow(''),
    preferredLocations: Joi.array().items(Joi.string().max(100)).max(20).optional(),
    budget: Joi.object({
      min: Joi.number().min(0).optional().allow(null),
      max: Joi.number().min(0).optional().allow(null),
      currency: Joi.string().max(10).optional().allow(''),
    }).optional(),
  }),

  update: Joi.object({
    // Optional edit guard: the updatedAt the form loaded (see VersionConflictError).
    expectedUpdatedAt: Joi.date().iso().optional(),
    name: Joi.string().min(2).max(120).optional(),
    email: Joi.string().email().max(254).optional().allow(''),
    phone: Joi.string().max(30).optional().allow(''),
    alternatePhone: Joi.string().max(30).optional().allow(''),
    status: Joi.string().valid('lead', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost').optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional().allow(''),
    // 'auto' hands the temperature back to the score (clears the manual pin).
    temperature: Joi.string().valid('hot', 'warm', 'cold', 'auto').optional(),
    notes: Joi.string().max(2000).optional().allow(''),
    requirements: Joi.string().max(2000).optional().allow(''),
    tags: Joi.array().items(Joi.string().max(40)).max(50).optional(),
    contactType: Joi.string().valid('lead', 'co_agent', 'referral_partner').optional(),
    source: Joi.string().max(100).optional().allow(''),
    organization: Joi.string().max(120).optional().allow(''),
    interestedListings: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).max(200).optional(),
    assignedTo: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
    lastContactAt: Joi.date().iso().optional().allow(null, ''),
    propertyType: Joi.string().max(50).optional().allow(''),
    preferredLocations: Joi.array().items(Joi.string().max(100)).max(20).optional(),
    budget: Joi.object({
      min: Joi.number().min(0).optional().allow(null),
      max: Joi.number().min(0).optional().allow(null),
      currency: Joi.string().max(10).optional().allow(''),
    }).optional(),
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
    status: Joi.string().valid('todo', 'in_progress', 'review', 'done', 'blocked').optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
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
    status: Joi.string().valid('todo', 'in_progress', 'review', 'done', 'blocked').optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
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

  empty: Joi.object({}),
};

const DEAL_STAGES = [
  'new_lead', 'contacted', 'qualified',
  'site_visit_scheduled', 'negotiation', 'booking_token', 'documentation',
  'closed_won', 'closed_lost',
  // Legacy — kept for backward compat
  'initial_contact', 'site_visit_done', 'payment_pending',
];

// CRM validation schemas
export const crmValidation = {
  addDeal: Joi.object({
    listingId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null, ''),
    type: Joi.string().valid('sale', 'rent', 'lease').optional(),
    stage: Joi.string().valid(...DEAL_STAGES).optional(),
    value: Joi.number().min(0).optional(),
    expectedCloseDate: Joi.date().iso().optional().allow(null, ''),
    notes: Joi.string().max(2000).optional().allow(''),
    commissionPercentage: Joi.number().min(0).max(100).optional(),
  }),

  // The property a deal is about. null clears it.
  setDealListing: Joi.object({
    listingId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().allow(null),
    type: Joi.string().valid('sale', 'rent', 'lease').optional(),
  }),

  updateDealStage: Joi.object({
    stage: Joi.string().valid(...DEAL_STAGES).required(),
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
    outcome: Joi.string().max(200).optional().allow(''),
  }),

  addCommunication: Joi.object({
    type: Joi.string().valid('call', 'email', 'sms', 'meeting', 'whatsapp', 'site_visit', 'note').required(),
    direction: Joi.string().valid('inbound', 'outbound').optional(),
    summary: Joi.string().min(2).max(500).required(),
    details: Joi.string().max(5000).optional().allow(''),
    duration: Joi.number().min(0).max(100000).optional(),
    outcome: Joi.string().max(200).optional().allow(''),
  }),

  // An amendment sends only what changed, so every field is optional — but at
  // least one must be present, or the request is a no-op that still writes an
  // "amended" line to the audit trail.
  updateCommunication: Joi.object({
    type: Joi.string().valid('call', 'email', 'sms', 'meeting', 'whatsapp', 'site_visit', 'note').optional(),
    direction: Joi.string().valid('inbound', 'outbound').optional(),
    summary: Joi.string().min(2).max(500).optional(),
    details: Joi.string().max(5000).optional().allow(''),
    duration: Joi.number().min(0).max(100000).optional(),
    outcome: Joi.string().max(200).optional().allow(''),
  }).min(1),
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

  // The recording is uploaded to Cloudinary by the client; only its https URL is
  // stored. A bare `url` string let `javascript:` and external-tracker URLs in.
  voiceNote: Joi.object({
    url: Joi.string().uri({ scheme: ['https'] }).max(2000).required(),
    label: Joi.string().max(200).allow('').optional(),
    duration: Joi.number().min(0).max(86400).optional(),
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
    avatar: Joi.string().uri({ allowRelative: true }).optional().allow(''),
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
    // No password. The account is created unusable and the recipient sets their
    // own through a single-use invite link, so an admin never handles — and the
    // product never transmits — a credential for someone else.
    assignedCategories: Joi.array().items(Joi.string().max(100)).max(200).optional(),
    phone: Joi.string().max(30).optional().allow(''),
    message: Joi.string().max(500).optional().allow(''),
  }),

  resendEmployeeInvite: Joi.object({}),

  adminSetEmployeePassword: Joi.object({
    newPassword: Joi.string().min(8).max(128).required(),
  }),

  adminToggleUserStatus: Joi.object({
    status: Joi.string().valid('active', 'inactive').required(),
  }),

  requestPasswordOtp: Joi.object({
    email: Joi.string().email().max(254).required(),
  }),

  dashboardWidgets: Joi.object({
    items: Joi.array().max(30).items(
      Joi.object({
        id: Joi.string().max(64).required(),
        type: Joi.string().valid('number', 'chart', 'battery', 'timeline', 'table', 'workload').required(),
        preset: Joi.string().max(40).allow('', null),
        label: Joi.string().trim().max(80).allow(''),
        dataPath: Joi.string().max(80).allow('', null),
        span: Joi.string().valid('sm', 'lg').default('sm'),
      })
    ).required(),
  }),

  savedViews: Joi.object({
    items: Joi.array().max(50).items(
      Joi.object({
        id: Joi.string().max(64).required(),
        name: Joi.string().trim().min(1).max(80).required(),
        queryString: Joi.string().max(2000).allow('').default(''),
      })
    ).required(),
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().min(1).max(128).required(),
    newPassword: Joi.string().min(8).max(128).required(),
  }),

  resetPasswordWithOtp: Joi.object({
    email: Joi.string().email().max(254).required(),
    otp: Joi.string().pattern(/^\d{6}$/).required(),
    newPassword: Joi.string().min(8).max(128).required(),
  }),

  setUserRole: Joi.object({
    role: Joi.string().valid('user', 'buyer', 'seller', 'employee', 'admin').required(),
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
      .uri({ allowRelative: true })
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
      .uri({ allowRelative: true })
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
    description: Joi.string().max(2000).optional().allow(''),
    address: Joi.string()
      .max(200)
      .optional()
      .allow('')
      .messages({
        'string.max': 'Address cannot exceed 200 characters',
      }),
    regularPrice: Joi.number()
      .min(0)
      .max(1000000000)
      .optional()
      .messages({
        'number.min': 'Price cannot be negative',
        'number.max': 'Price cannot exceed 1 billion',
      }),
    discountPrice: Joi.number()
      .min(0)
      .max(1000000000)
      // Only meaningful once a real price is set. Most listings are imported or
      // drafted with no price at all, and the form defaults both fields to 0 —
      // `0 < 0` is false, so `exist()` rejected every priceless listing with
      // "Discount price must be less than regular price". The controller already
      // guards this correctly (effectiveRegularPrice > 0); validateBody runs
      // first, so the stricter rule here made that fix unreachable.
      .when('regularPrice', {
        is: Joi.number().greater(0).required(),
        then: Joi.number().less(Joi.ref('regularPrice')),
        otherwise: Joi.number(),
      })
      .optional()
      .messages({
        'number.min': 'Discount price cannot be negative',
        'number.max': 'Discount price cannot exceed 1 billion',
        'number.less': 'Discount price must be less than regular price',
      }),
    bathrooms: Joi.number().integer().min(0).max(20).optional().default(0)
      .messages({
        'number.integer': 'Bathrooms must be a whole number',
        'number.max': 'Cannot have more than 20 bathrooms',
      }),
    bedrooms: Joi.number().integer().min(0).max(20).optional().default(0)
      .messages({
        'number.integer': 'Bedrooms must be a whole number',
        'number.max': 'Cannot have more than 20 bedrooms',
      }),
    furnished: Joi.boolean().optional(),
    parking: Joi.boolean().optional(),
    type: Joi.string()
      .valid('sale', 'rent')
      .optional()
      .messages({
        'any.only': 'Type must be either "sale" or "rent"',
      }),
    offer: Joi.boolean().optional(),
    imageUrls: Joi.array()
      .items(Joi.string().max(500).pattern(/^(https?:\/\/|\/)/, 'valid URL'))
      .max(10)
      .optional()
      .default([])
      .messages({
        'array.max': 'Cannot upload more than 10 images',
        'string.uri': 'Each image must be a valid URL',
      }),
    category: Joi.string().max(100).optional().allow(''),
    attributes: Joi.object().unknown(true).optional(),
    propertyTypeFields: Joi.object().unknown(true).optional(),
    ownerIds: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).max(50).optional(),
    city: Joi.string().max(100).optional().allow(''),
    locality: Joi.string().max(100).optional().allow(''),
    areaName: Joi.string().max(100).optional().allow(''),
    state: Joi.string().max(100).optional().allow(''),
    pincode: Joi.string().max(20).optional().allow(''),
    areaSqFt: Joi.number().min(0).optional(),
    sqYard: Joi.number().min(0).optional(),
    sqYardRate: Joi.number().min(0).optional(),
    totalValue: Joi.number().min(0).optional(),
    plotSize: Joi.string().max(50).optional().allow(''),
    propertyNo: Joi.string().max(50).optional().allow(''),
    remarks: Joi.string().max(2000).optional().allow(''),
    otherAttachment: Joi.string().max(500).pattern(/^(https?:\/\/|\/)/, 'valid URL').optional().allow(''),
    status: Joi.string().valid('available', 'sold', 'rented', 'under_negotiation').optional(),
    assignedAgent: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null, ''),
    propertyCategory: Joi.string().valid('residential', 'commercial', 'land', 'unknown').optional(),
    propertyType: Joi.string().max(50).optional().allow(''),
    commercialType: Joi.string().valid('office', 'shop', 'showroom', 'warehouse', 'other', '').optional().allow(''),
    plotType: Joi.string().valid('residential', 'commercial', 'agricultural', 'other', '').optional().allow(''),
    location: Joi.object({
      lat: Joi.number().min(-90).max(90).optional().allow(null),
      lng: Joi.number().min(-180).max(180).optional().allow(null),
    }).optional(),
  }),

  update: Joi.object({
    // Optional edit guard: the updatedAt the form loaded (see VersionConflictError).
    expectedUpdatedAt: Joi.date().iso().optional(),
    name: Joi.string().min(3).max(100).optional(),
    description: Joi.string().max(2000).optional().allow(''),
    address: Joi.string().max(200).optional().allow(''),
    regularPrice: Joi.number().min(0).max(1000000000).optional(),
    discountPrice: Joi.number()
      .min(0)
      .max(1000000000)
      .when('regularPrice', {
        is: Joi.number().exist(),
        then: Joi.number().less(Joi.ref('regularPrice')),
      })
      .optional()
      .messages({
        'number.min': 'Discount price cannot be negative',
        'number.max': 'Discount price cannot exceed 1 billion',
        'number.less': 'Discount price must be less than regular price',
      }),
    // Allow 0 for commercial/land; residential updates can still send 0 during a category change
    bathrooms: Joi.number().integer().min(0).max(20).optional(),
    bedrooms: Joi.number().integer().min(0).max(20).optional(),
    furnished: Joi.boolean().optional(),
    parking: Joi.boolean().optional(),
    type: Joi.string().valid('sale', 'rent').optional(),
    offer: Joi.boolean().optional(),
    imageUrls: Joi.array()
      .items(Joi.string().max(500).pattern(/^(https?:\/\/|\/)/, 'valid URL'))
      .max(10)
      .optional()
      .messages({
        'string.uri': 'Each image must be a valid URL',
      }),
    category: Joi.string().max(100).optional().allow(''),
    attributes: Joi.object().unknown(true).optional(),
    propertyTypeFields: Joi.object().unknown(true).optional(),
    ownerIds: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).max(50).optional(),
    city: Joi.string().max(100).optional().allow(''),
    locality: Joi.string().max(100).optional().allow(''),
    areaName: Joi.string().max(100).optional().allow(''),
    state: Joi.string().max(100).optional().allow(''),
    pincode: Joi.string().max(20).optional().allow(''),
    areaSqFt: Joi.number().min(0).optional(),
    sqYard: Joi.number().min(0).optional(),
    sqYardRate: Joi.number().min(0).optional(),
    totalValue: Joi.number().min(0).optional(),
    plotSize: Joi.string().max(50).optional().allow(''),
    propertyNo: Joi.string().max(50).optional().allow(''),
    remarks: Joi.string().max(2000).optional().allow(''),
    otherAttachment: Joi.string().max(500).pattern(/^(https?:\/\/|\/)/, 'valid URL').optional().allow(''),
    status: Joi.string().valid('available', 'sold', 'rented', 'under_negotiation').optional(),
    assignedAgent: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null, ''),
    propertyCategory: Joi.string().valid('residential', 'commercial', 'land', 'unknown').optional(),
    propertyType: Joi.string().max(50).optional().allow(''),
    commercialType: Joi.string().valid('office', 'shop', 'showroom', 'warehouse', 'other', '').optional().allow(''),
    plotType: Joi.string().valid('residential', 'commercial', 'agricultural', 'other', '').optional().allow(''),
    location: Joi.object({
      lat: Joi.number().min(-90).max(90).optional().allow(null),
      lng: Joi.number().min(-180).max(180).optional().allow(null),
    }).optional(),
  }),
};

// Buyer requirement validation schemas
export const buyerRequirementValidation = {
  create: Joi.object({
    clientId: Joi.string().hex().length(24).optional().allow(null),
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
    clientId: Joi.string().hex().length(24).optional().allow(null),
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
// Matches maxlength on the Category model's `name`; one number so they cannot drift.
export const CATEGORY_NAME_MAX = 100;

export const categoryValidation = {
  create: Joi.object({
    name: Joi.string()
      .min(2)
      .max(CATEGORY_NAME_MAX)
      .required()
      .messages({
        'string.min': 'Category name must be at least 2 characters long',
        'string.max': `Category name cannot exceed ${CATEGORY_NAME_MAX} characters`,
        'any.required': 'Category name is required',
      }),
    fields: Joi.array().items(Joi.object().unknown(true)).max(200).optional(),
  }),

  rename: Joi.object({
    name: Joi.string().min(2).max(CATEGORY_NAME_MAX).required().messages({
      'string.min': 'Category name must be at least 2 characters long',
      'string.max': `Category name cannot exceed ${CATEGORY_NAME_MAX} characters`,
      'any.required': 'Category name is required',
    }),
  }),

  // Shape only. The field definitions themselves are checked by
  // utils/categoryFields.js, which knows about reserved keys, duplicates and
  // patterns that can hang the process — none of which Joi can express here.
  updateFields: Joi.object({
    fields: Joi.array().items(Joi.object().unknown(true)).max(100).required().messages({
      'any.required': 'fields is required',
      'array.max': 'A category can have at most 100 fields',
    }),
  }),

  updateLocation: Joi.object({
    defaultLocation: Joi.object({
      lat: Joi.number().allow(null).optional(),
      lng: Joi.number().allow(null).optional(),
    }).allow(null).required(),
  }),
};

export const transactionValidation = {
  create: Joi.object({
    property: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null, ''),
    propertyName: Joi.string().min(1).max(200).required(),
    client: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null, ''),
    clientName: Joi.string().min(1).max(200).required(),
    type: Joi.string().valid('sale', 'rent', 'lease').optional(),
    amount: Joi.number().min(0).required(),
    commissionPercent: Joi.number().min(0).max(100).optional(),
    commission: Joi.number().min(0).optional(),
    status: Joi.string().valid('pending', 'in_progress', 'completed', 'cancelled').optional(),
    date: Joi.date().iso().optional().allow(null, ''),
    notes: Joi.string().max(2000).optional().allow(''),
    coAgent: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null, ''),
    coAgentName: Joi.string().max(200).optional().allow(''),
    coAgentCommissionPercent: Joi.number().min(0).max(100).optional(),
    coAgentCommission: Joi.number().min(0).optional(),
  }).custom((value, helpers) => {
    const total = (value.commissionPercent || 0) + (value.coAgentCommissionPercent || 0);
    if (total > 100) return helpers.error('commission.combinedTooHigh');
    return value;
  }).messages({ 'commission.combinedTooHigh': 'Combined commission percentage cannot exceed 100%' }),

  update: Joi.object({
    property: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null, ''),
    propertyName: Joi.string().min(1).max(200).optional(),
    client: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null, ''),
    clientName: Joi.string().min(1).max(200).optional(),
    type: Joi.string().valid('sale', 'rent', 'lease').optional(),
    amount: Joi.number().min(0).optional(),
    commissionPercent: Joi.number().min(0).max(100).optional(),
    commission: Joi.number().min(0).optional(),
    status: Joi.string().valid('pending', 'in_progress', 'completed', 'cancelled').optional(),
    date: Joi.date().iso().optional().allow(null, ''),
    notes: Joi.string().max(2000).optional().allow(''),
    coAgent: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null, ''),
    coAgentName: Joi.string().max(200).optional().allow(''),
    coAgentCommissionPercent: Joi.number().min(0).max(100).optional(),
    coAgentCommission: Joi.number().min(0).optional(),
  }).custom((value, helpers) => {
    const total = (value.commissionPercent || 0) + (value.coAgentCommissionPercent || 0);
    if (total > 100) return helpers.error('commission.combinedTooHigh');
    return value;
  }).messages({ 'commission.combinedTooHigh': 'Combined commission percentage cannot exceed 100%' }),
};

export const calendarEventValidation = {
  create: Joi.object({
    title: Joi.string().trim().min(1).max(200).required(),
    date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    time: Joi.string().pattern(/^\d{2}:\d{2}$/).default('09:00'),
    reminderMinutes: Joi.number().integer().min(0).max(10080).default(15),
  }),
};

// ─── Workspace, platform and automation writes ───────────────────────────────
//
// These schemas check SHAPE — types, lengths, ids that are ids — and leave the
// domain rules where they already live, each with a better message than Joi
// could give: the stage catalogue for pipelines, the screen catalogue for
// screens, WEBHOOK_EVENTS via cleanEvents, the controllers' own lists of
// editable and platform-only keys. Where a controller rejects unknown keys
// itself (tenant config, platform tenant edit) the schema is `.unknown(true)`,
// so "slug is managed by the platform" still reaches the user instead of the
// key being stripped silently.
//
// A field the controller reads but a schema here does not name is DROPPED by
// stripUnknown — that is a broken feature, not a safer one. Add the field.

const objectId = Joi.string().hex().length(24);
const optionalId = objectId.allow(null, '');
const freeText = (max) => Joi.string().max(max).allow('');
const looseDate = Joi.alternatives(Joi.date(), Joi.string().allow('')).allow(null);
// Accept local and internal domains — Joi's default TLD list rejects them.
const email = Joi.string().email({ tlds: { allow: false } }).max(254);

export const tenantValidation = {
  // updateTenantConfig rejects platform-only and unknown keys with its own
  // message, and merges each object into what is stored.
  updateConfig: Joi.object({
    name: Joi.string().trim().min(1).max(120),
    branding: Joi.object(),
    locale: Joi.object(),
    workflow: Joi.object(),
  }).unknown(true),
  // validateStageSelection (stageCatalogue.js) owns which stages exist,
  // duplicates and the required end states.
  updatePipeline: Joi.object({
    stages: Joi.array().items(Joi.object({
      key: Joi.string().max(60),
      label: Joi.string().max(120).allow(''),
      color: Joi.string().max(40).allow(''),
    }).unknown(true)),
  }),
  // isKnownScreen (screenCatalogue.js) owns which ids exist.
  updateScreens: Joi.object({
    screens: Joi.object().pattern(Joi.string().max(60), Joi.boolean()),
    labels: Joi.object().pattern(Joi.string().max(60), Joi.string().max(200).allow('')),
  }),
  updateMail: Joi.object({
    enabled: Joi.boolean(),
    host: freeText(255),
    port: Joi.alternatives(Joi.number().integer().min(1).max(65535), Joi.string().allow('')),
    secure: Joi.boolean(),
    user: freeText(255),
    // Empty means "keep the stored one" — the form cannot show it back.
    password: freeText(500),
    from: freeText(254),
    fromName: freeText(120),
  }),
  empty: Joi.object({}),
};

export const platformValidation = {
  // provisionTenant validates the slug, plan and admin account itself.
  createTenant: Joi.object({
    name: Joi.string().trim().max(120),
    slug: Joi.string().trim().max(63),
    adminEmail: email,
    adminName: freeText(100),
    adminPassword: Joi.string().max(200).allow(''),
    plan: Joi.string().max(40),
    trialDays: Joi.number().integer().min(0).max(365).allow(null, ''),
    branding: Joi.object(),
    locale: Joi.object(),
    features: Joi.object().pattern(Joi.string(), Joi.boolean()),
    seedSampleData: Joi.boolean(),
  }),
  // updateTenant rejects keys outside PLATFORM_EDITABLE with its own message.
  updateTenant: Joi.object({
    name: Joi.string().trim().max(120),
    plan: Joi.string().max(40),
    status: Joi.string().max(40),
    trialEndsAt: Joi.date().allow(null, ''),
    limits: Joi.object().pattern(Joi.string(), Joi.number().min(0).allow(null)),
    features: Joi.object().pattern(Joi.string(), Joi.boolean()),
    customDomain: freeText(120),
    billingEmail: email.allow(''),
    internalNotes: freeText(2000),
  }).unknown(true),
  reason: Joi.object({ reason: freeText(500) }),
  changePlan: Joi.object({
    plan: Joi.string().max(40).required(),
    keepOverrides: Joi.boolean(),
  }),
  payInvoice: Joi.object({ reference: freeText(200) }),
  empty: Joi.object({}),
};

export const webhookValidation = {
  // validateWebhookUrl and cleanEvents (WEBHOOK_EVENTS) decide what is allowed.
  create: Joi.object({
    name: Joi.string().max(80).allow(''),
    url: Joi.string().max(2000).allow(''),
    events: Joi.array().items(Joi.string().max(80)),
  }),
  update: Joi.object({
    name: Joi.string().max(80).allow(''),
    url: Joi.string().max(2000).allow(''),
    events: Joi.array().items(Joi.string().max(80)),
    isActive: Joi.boolean(),
  }),
  empty: Joi.object({}),
};

// cleanSteps in the controller normalises each step.
const sequenceSteps = Joi.array().max(50).items(Joi.object().unknown(true));
export const sequenceValidation = {
  create: Joi.object({
    name: Joi.string().max(120).allow(''),
    description: freeText(1000),
    steps: sequenceSteps,
  }),
  update: Joi.object({
    name: Joi.string().max(120).allow(''),
    description: freeText(1000),
    steps: sequenceSteps,
    isActive: Joi.boolean(),
  }),
  enroll: Joi.object({ clientId: objectId.required() }),
};

export const emailTemplateValidation = {
  upsert: Joi.object({
    subject: Joi.string().max(200).allow(''),
    html: Joi.string().max(100_000).allow(''),
    isActive: Joi.boolean(),
  }),
  draft: Joi.object({
    subject: Joi.string().max(200).allow(''),
    html: Joi.string().max(100_000).allow(''),
  }),
};

const reportTemplateBody = {
  name: Joi.string().max(200).allow(''),
  // Enum left to the model: the UI and the model already disagree on the
  // list, and that is a decision, not a validation fix.
  type: Joi.string().max(60),
  description: freeText(1000),
  sections: Joi.array().items(Joi.string().max(200)),
};
export const reportTemplateValidation = {
  create: Joi.object(reportTemplateBody),
  update: Joi.object(reportTemplateBody),
  send: Joi.object({
    clientEmail: email.allow(''),
    clientName: freeText(200),
    propertyName: freeText(200),
    notes: freeText(2000),
    reportHtml: Joi.string().max(500_000).allow(''),
  }),
  empty: Joi.object({}),
};

const generatedReportBody = {
  templateId: optionalId,
  templateName: freeText(200),
  templateType: Joi.string().max(60),
  templateSections: Joi.array().items(Joi.alternatives(Joi.string().max(200), Joi.object().unknown(true))),
  clientId: optionalId,
  clientName: freeText(200),
  clientEmail: email.allow(''),
  propertyName: freeText(200),
  listingId: optionalId,
  notes: freeText(2000),
  agentName: freeText(200),
  reportDate: looseDate,
  html: Joi.string().max(500_000).allow(''),
};
export const generatedReportValidation = {
  create: Joi.object(generatedReportBody),
  update: Joi.object({ ...generatedReportBody, status: Joi.string().valid('draft', 'sent') }),
  send: Joi.object({ clientEmail: email.allow('') }),
};

export const tagValidation = {
  create: Joi.object({
    name: Joi.string().max(40).allow(''),
    color: Joi.string().max(20),
    description: freeText(200),
  }),
  update: Joi.object({
    name: Joi.string().max(40).allow(''),
    color: Joi.string().max(20),
    description: freeText(200),
  }),
  empty: Joi.object({}),
};

export const leadSourceValidation = {
  create: Joi.object({
    name: Joi.string().max(60).allow(''),
    monthlyCost: Joi.number().min(0).allow(null, ''),
    description: freeText(200),
  }),
  update: Joi.object({
    name: Joi.string().max(60).allow(''),
    monthlyCost: Joi.number().min(0).allow(null, ''),
    isActive: Joi.boolean(),
    description: freeText(200),
  }),
};

export const shareValidation = {
  // The controller owns "at least one" and "at most 50" with its own messages;
  // this makes sure each id is an id, so `$in` never receives an operator.
  create: Joi.object({
    listingIds: Joi.array().items(objectId),
    expiryDays: Joi.number().integer().allow(null, ''),
    label: freeText(120),
    recipientName: freeText(120),
    recipientPhone: freeText(30),
    message: freeText(1000),
    showPrice: Joi.boolean(),
    passcode: Joi.string().max(100).allow(''),
  }),
  empty: Joi.object({}),
};

export const searchValidation = {
  // Strings, so a search log lookup can never be handed an operator object.
  click: Joi.object({
    query: freeText(500),
    entity: freeText(40),
    id: Joi.string().max(64).allow(''),
  }),
  saved: Joi.object({
    name: Joi.string().max(120).allow(''),
    query: freeText(500),
    entities: Joi.array().items(Joi.string().max(40)),
  }),
  empty: Joi.object({}),
};

export const notificationValidation = {
  // The controller keeps only known notification types (notificationTypes.js)
  // and the two channel booleans; this only insists on the shape. The mobile
  // app sends the same body.
  preferences: Joi.object({
    notifications: Joi.object().pattern(
      Joi.string().max(80),
      Joi.object({ inApp: Joi.boolean(), email: Joi.boolean() }).unknown(true)
    ),
    privacy: Joi.object().pattern(Joi.string().max(40), Joi.boolean().allow(null)),
  }),
  empty: Joi.object({}),
};

// ── The last six write routes that had no schema ────────────────────────────
// Types and shapes only. Each controller still owns its own wording ("Choose
// a password.", "Select at least one buyer"), so fields it checks itself are
// optional here — a schema that required them would replace a sentence a
// person can act on with Joi's "password is required".
export const inviteValidation = {
  accept: Joi.object({
    password: Joi.string().max(200),
    acceptTerms: Joi.boolean(),
  }),
};

export const legalValidation = {
  accept: Joi.object({
    // Compared with LEGAL_VERSION by the controller, which answers 409 with
    // the current version when they differ.
    version: Joi.string().max(40).allow(''),
  }),
};

export const buyerRequirementActionValidation = {
  status: Joi.object({
    // Checked against the model's enum by the save; this only rules out a
    // non-string (an operator object) reaching it.
    status: Joi.string().max(30).required(),
  }),
  match: Joi.object({
    buyerRequirementId: objectId.required(),
    propertyId: objectId.required(),
  }),
  bulk: Joi.object({
    ids: Joi.array().items(Joi.string().max(64)).max(500),
    action: Joi.string().valid('delete', 'status', 'assign'),
    value: Joi.string().max(64).allow('', null),
  }),
};

/** For actions whose input is entirely in the URL — refuses a body that tries to say more. */
export const emptyBodyValidation = Joi.object({});
