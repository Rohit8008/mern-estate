import Role from '../models/role.model.js';
import User from '../models/user.model.js';
import { errorHandler, sendSuccessResponse } from '../utils/error.js';

// Create a new role
export const createRole = async (req, res, next) => {
  try {
    const { name, description, permissions } = req.body;
    
    // Check if role with same name already exists
    const existingRole = await Role.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existingRole) {
      return next(errorHandler(400, 'Role with this name already exists'));
    }

    const roleData = {
      name,
      description: description || '',
      permissions: permissions || {},
      createdBy: req.user.id
    };

    const role = await Role.create(roleData);
    sendSuccessResponse(res, role, 'Role created successfully', 201);
  } catch (error) {
    next(error);
  }
};

// Get all roles
export const getRoles = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, isActive } = req.query;
    const filter = {};
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const roles = await Role.find(filter)
      .populate('createdBy', 'username firstName lastName')
      .populate('updatedBy', 'username firstName lastName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Role.countDocuments(filter);

    sendSuccessResponse(res, {
      roles,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    }, 'Roles retrieved successfully');
  } catch (error) {
    next(error);
  }
};

// Get single role
export const getRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id)
      .populate('createdBy', 'username firstName lastName')
      .populate('updatedBy', 'username firstName lastName');
    
    if (!role) {
      return next(errorHandler(404, 'Role not found'));
    }

    sendSuccessResponse(res, role, 'Role retrieved successfully');
  } catch (error) {
    next(error);
  }
};

// Update role
export const updateRole = async (req, res, next) => {
  try {
    const { name, description, permissions, isActive } = req.body;
    
    // Check if role is system role
    const existingRole = await Role.findById(req.params.id);
    if (!existingRole) {
      return next(errorHandler(404, 'Role not found'));
    }

    if (existingRole.isSystem && (name !== existingRole.name || isActive === false)) {
      return next(errorHandler(400, 'Cannot modify system roles'));
    }

    // Check if new name conflicts with existing roles
    if (name && name !== existingRole.name) {
      const nameConflict = await Role.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: req.params.id }
      });
      if (nameConflict) {
        return next(errorHandler(400, 'Role with this name already exists'));
      }
    }

    const updateData = {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(permissions && { permissions }),
      ...(isActive !== undefined && { isActive }),
      updatedBy: req.user.id
    };

    const updatedRole = await Role.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'username firstName lastName')
     .populate('updatedBy', 'username firstName lastName');

    sendSuccessResponse(res, updatedRole, 'Role updated successfully');
  } catch (error) {
    next(error);
  }
};

// Delete role
export const deleteRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return next(errorHandler(404, 'Role not found'));
    }

    if (role.isSystem) {
      return next(errorHandler(400, 'Cannot delete system roles'));
    }

    // Check if any users are assigned to this role
    const usersWithRole = await User.countDocuments({ assignedRole: req.params.id });
    const force = String(req.query.force || 'false') === 'true';
    if (usersWithRole > 0 && !force) {
      return next(errorHandler(400, `Cannot delete role. ${usersWithRole} user(s) are assigned to this role. You can force delete to unassign from all users and remove the role.`));
    }

    if (usersWithRole > 0 && force) {
      // Unassign role from all users
      await User.updateMany({ assignedRole: req.params.id }, { $set: { assignedRole: null } });
    }

    await Role.findByIdAndDelete(req.params.id);
    sendSuccessResponse(res, { deleted: true, id: req.params.id, unassignedUsers: force ? usersWithRole : 0 }, 'Role deleted successfully');
  } catch (error) {
    next(error);
  }
};

// Assign role to user
export const assignRoleToUser = async (req, res, next) => {
  try {
    const { userId, roleId } = req.body;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return next(errorHandler(404, 'User not found'));
    }

    // Check if role exists
    const role = await Role.findById(roleId);
    if (!role) {
      return next(errorHandler(404, 'Role not found'));
    }

    if (!role.isActive) {
      return next(errorHandler(400, 'Cannot assign inactive role'));
    }

    // Update user's assigned role
    user.assignedRole = roleId;
    await user.save();

    // Populate the role data for response
    await user.populate('assignedRole');

    sendSuccessResponse(res, {
      user: {
        id: user._id,
        username: user.username,
        assignedRole: user.assignedRole
      }
    }, 'Role assigned successfully');
  } catch (error) {
    next(error);
  }
};

// Remove role from user
export const removeRoleFromUser = async (req, res, next) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return next(errorHandler(404, 'User not found'));
    }

    user.assignedRole = null;
    await user.save();

    sendSuccessResponse(res, {
      user: {
        id: user._id,
        username: user.username,
        assignedRole: null
      }
    }, 'Role removed successfully');
  } catch (error) {
    next(error);
  }
};

// Get users with specific role
export const getUsersByRole = async (req, res, next) => {
  try {
    const { roleId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const users = await User.find({ assignedRole: roleId })
      .select('username firstName lastName email role status createdAt')
      .populate('assignedRole', 'name description')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments({ assignedRole: roleId });

    sendSuccessResponse(res, {
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    }, 'Users by role retrieved successfully');
  } catch (error) {
    next(error);
  }
};

// Get all available permissions
export const getAvailablePermissions = async (req, res, next) => {
  try {
    const permissions = {
      userManagement: {
        createUser: 'Create new users',
        updateUser: 'Update user information',
        deleteUser: 'Delete users',
        viewUsers: 'View user list'
      },
      ownerManagement: {
        createOwner: 'Create new owners',
        updateOwner: 'Update owner information',
        deleteOwner: 'Delete owners',
        viewOwners: 'View owner list',
        toggleOwnerActive: 'Activate/deactivate owners'
      },
      listingManagement: {
        createListing: 'Create new listings',
        updateListing: 'Update listing information',
        deleteListing: 'Delete listings',
        viewListings: 'View listing list',
        publishListing: 'Publish/unpublish listings'
      },
      categoryManagement: {
        createCategory: 'Create new categories',
        updateCategory: 'Update category information',
        deleteCategory: 'Delete categories',
        viewCategories: 'View category list'
      },
      messageManagement: {
        viewMessages: 'View messages',
        sendMessages: 'Send messages',
        deleteMessages: 'Delete messages'
      },
      buyerRequirements: {
        createBuyerRequirement: 'Create buyer requirements',
        updateBuyerRequirement: 'Update buyer requirements',
        deleteBuyerRequirement: 'Delete buyer requirements',
        viewBuyerRequirements: 'View buyer requirements'
      },
      system: {
        uploadFiles: 'Upload files',
        viewAnalytics: 'View analytics and reports',
        exportData: 'Export data',
        manageRoles: 'Manage roles and permissions',
        systemSettings: 'Access system settings',
        viewLogs: 'View system logs'
      }
    };

    sendSuccessResponse(res, permissions, 'Permissions retrieved successfully');
  } catch (error) {
    next(error);
  }
};

// Initialize default roles
export const initializeDefaultRoles = async (req, res, next) => {
  try {
    const defaultRoles = Role.getDefaultRoles();
    const createdRoles = [];

    for (const roleData of defaultRoles) {
      const existingRole = await Role.findOne({ name: roleData.name });
      if (!existingRole) {
        const role = await Role.create({
          ...roleData,
          createdBy: req.user.id
        });
        createdRoles.push(role);
      }
    }

    sendSuccessResponse(res, {
      createdRoles: createdRoles.length
    }, 'Default roles initialized');
  } catch (error) {
    next(error);
  }
};
