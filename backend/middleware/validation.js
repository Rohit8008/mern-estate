import Joi from 'joi';

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
      .required()
      .messages({
        'string.min': 'Description must be at least 10 characters long',
        'string.max': 'Description cannot exceed 2000 characters',
        'any.required': 'Description is required',
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
    userRef: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid user reference',
        'any.required': 'User reference is required',
      }),
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
      .required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'string.max': 'Email cannot exceed 254 characters',
        'any.required': 'Buyer email is required',
      }),
    buyerPhone: Joi.string()
      .pattern(/^[\+]?[1-9][\d]{0,15}$/)
      .required()
      .messages({
        'string.pattern.base': 'Please provide a valid phone number',
        'any.required': 'Buyer phone is required',
      }),
    preferredLocation: Joi.string()
      .min(2)
      .max(200)
      .required()
      .messages({
        'string.min': 'Location must be at least 2 characters long',
        'string.max': 'Location cannot exceed 200 characters',
        'any.required': 'Preferred location is required',
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
      .messages({
        'number.min': 'Minimum price cannot be negative',
        'number.max': 'Minimum price cannot exceed 1 billion',
      }),
    maxPrice: Joi.number()
      .min(0)
      .max(1000000000)
      .optional()
      .messages({
        'number.min': 'Maximum price cannot be negative',
        'number.max': 'Maximum price cannot exceed 1 billion',
      }),
    minBedrooms: Joi.number()
      .integer()
      .min(0)
      .max(20)
      .optional()
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
      .optional(),
    buyerPhone: Joi.string()
      .pattern(/^[\+]?[1-9][\d]{0,15}$/)
      .optional(),
    preferredLocation: Joi.string()
      .min(2)
      .max(200)
      .optional(),
    propertyType: Joi.string()
      .valid('sale', 'rent')
      .optional(),
    minPrice: Joi.number()
      .min(0)
      .max(1000000000)
      .optional(),
    maxPrice: Joi.number()
      .min(0)
      .max(1000000000)
      .optional(),
    minBedrooms: Joi.number()
      .integer()
      .min(0)
      .max(20)
      .optional(),
    minBathrooms: Joi.number()
      .integer()
      .min(0)
      .max(20)
      .optional(),
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
  create: Joi.object({
    content: Joi.string()
      .min(1)
      .max(1000)
      .required()
      .messages({
        'string.min': 'Message cannot be empty',
        'string.max': 'Message cannot exceed 1000 characters',
        'any.required': 'Message content is required',
      }),
    recipientId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid recipient ID',
        'any.required': 'Recipient is required',
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
    slug: Joi.string()
      .pattern(/^[a-z0-9-]+$/)
      .min(2)
      .max(50)
      .required()
      .messages({
        'string.pattern.base': 'Slug must contain only lowercase letters, numbers, and hyphens',
        'string.min': 'Slug must be at least 2 characters long',
        'string.max': 'Slug cannot exceed 50 characters',
        'any.required': 'Category slug is required',
      }),
    description: Joi.string()
      .max(200)
      .optional()
      .messages({
        'string.max': 'Description cannot exceed 200 characters',
      }),
    icon: Joi.string()
      .max(50)
      .optional()
      .messages({
        'string.max': 'Icon name cannot exceed 50 characters',
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
