import Category from '../models/category.model.js';
import User from '../models/user.model.js';
import Listing from '../models/listing.model.js';
import { errorHandler } from '../utils/error.js';

const toSlug = (name) =>
  name
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

export const createCategory = async (req, res, next) => {
  try {
    const { name, fields } = req.body;
    if (!name || !name.trim()) return next(errorHandler(400, 'Name is required'));
    const slug = toSlug(name);
    const exists = await Category.findOne({ slug });
    if (exists) return next(errorHandler(409, 'Category already exists'));
    const category = await Category.create({ name: name.trim(), slug, fields: Array.isArray(fields) ? fields : [] });
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
};

export const getCategories = async (req, res, next) => {
  try {
    const categories = await Category.find({}).sort({ name: 1 });
    res.status(200).json(categories);
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) return next(errorHandler(404, 'Category not found'));
    
    // Remove this category from all users' assignedCategories
    await User.updateMany(
      { assignedCategories: category.slug },
      { $pull: { assignedCategories: category.slug } }
    );
    
    // Update listings that reference this category to remove the category reference
    await Listing.updateMany(
      { category: category.slug },
      { $unset: { category: 1 } }
    );
    
    // Delete the category
    await Category.findByIdAndDelete(id);
    
    res.status(200).json('Category has been deleted and removed from all users and listings!');
  } catch (error) {
    next(error);
  }
};

export const getCategoryBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const cat = await Category.findOne({ slug });
    if (!cat) return next(errorHandler(404, 'Category not found'));
    res.status(200).json(cat);
  } catch (error) {
    next(error);
  }
};

export const updateCategoryFields = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fields } = req.body;
    if (!Array.isArray(fields)) return next(errorHandler(400, 'fields must be an array'));
    const updated = await Category.findByIdAndUpdate(id, { $set: { fields } }, { new: true });
    if (!updated) return next(errorHandler(404, 'Category not found'));
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};


