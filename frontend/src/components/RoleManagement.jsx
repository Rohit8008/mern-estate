import React, { useState, useEffect } from 'react';
import { apiClient } from '../utils/http';
import { 
  HiOutlinePlus, 
  HiOutlinePencil, 
  HiOutlineTrash, 
  HiOutlineUser, 
  HiOutlineKey, 
  HiOutlineShieldCheck,
  HiOutlineX,
  HiOutlineCheck,
  HiOutlineEye,
  HiOutlineEyeOff
} from 'react-icons/hi';

// --- Local cache helpers ---
const CACHE_KEYS = {
  roles: 'rm_cache_roles',
  users: 'rm_cache_users',
  permissions: 'rm_cache_permissions',
};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const readCache = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

const writeCache = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded – ignore */ }
};

const RoleManagement = () => {
  const [roles, setRoles] = useState(() => readCache(CACHE_KEYS.roles) || []);
  const [users, setUsers] = useState(() => readCache(CACHE_KEYS.users) || []);
  const [permissions, setPermissions] = useState(() => readCache(CACHE_KEYS.permissions) || {});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('roles');

  // Role form state
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    permissions: {}
  });
  const [roleFormError, setRoleFormError] = useState('');

  // User role assignment state
  const [showUserRoleModal, setShowUserRoleModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');

  // Only hit API if cache is empty/expired — not on every mount
  useEffect(() => {
    if (!readCache(CACHE_KEYS.roles)) fetchRoles();
    if (!readCache(CACHE_KEYS.users)) fetchUsers();
    if (!readCache(CACHE_KEYS.permissions)) fetchPermissions();
  }, []);

  const fetchRoles = async () => {
    try {
      const data = await apiClient.get('/roles');
      const rolesData = (data && data.data && Array.isArray(data.data.roles)) ? data.data.roles : [];
      setRoles(rolesData);
      writeCache(CACHE_KEYS.roles, rolesData);
    } catch (error) {
      console.error('Error fetching roles:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await apiClient.get('/user/list');
      const usersData = Array.isArray(data) ? data : [];
      setUsers(usersData);
      writeCache(CACHE_KEYS.users, usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchPermissions = async () => {
    try {
      const data = await apiClient.get('/roles/permissions');
      const permsData = (data && data.data) ? data.data : {};
      setPermissions(permsData);
      writeCache(CACHE_KEYS.permissions, permsData);
    } catch (error) {
      console.error('Error fetching permissions:', error);
    }
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    setLoading(true);
    setRoleFormError('');
    
    try {
      await apiClient.post('/roles', roleForm);
      setShowRoleForm(false);
      setRoleForm({ name: '', description: '', permissions: {} });
      fetchRoles();
    } catch (error) {
      console.error('Error creating role:', error);
      setRoleFormError(error.message || 'Failed to create role');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (e) => {
    e.preventDefault();
    setLoading(true);
    setRoleFormError('');
    
    try {
      await apiClient.put(`/roles/${editingRole._id}`, roleForm);
      setShowRoleForm(false);
      setEditingRole(null);
      setRoleForm({ name: '', description: '', permissions: {} });
      fetchRoles();
    } catch (error) {
      console.error('Error updating role:', error);
      setRoleFormError(error.message || 'Failed to update role');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!confirm('Are you sure you want to delete this role?')) return;
    
    try {
      try {
        await apiClient.delete(`/roles/${roleId}`);
      } catch (err) {
        const msg = err?.message || 'Failed to delete role.';
        // If role is assigned to users, offer force delete
        if (/assigned to this role/i.test(msg)) {
          const proceed = confirm(
            `${msg}\n\nDo you want to force delete this role? This will unassign it from all users and remove it.`
          );
          if (!proceed) return;
          try {
            await apiClient.delete(`/roles/${roleId}?force=true`);
          } catch (e2) {
            alert(e2?.message || 'Force delete failed.');
            return;
          }
        } else {
          alert(msg);
          return;
        }
      }
      // Success path
      fetchRoles();
      // Also refresh users list since some may have been unassigned
      fetchUsers();
    } catch (error) {
      console.error('Error deleting role:', error);
    }
  };

  const handleAssignRole = async () => {
    if (!selectedUser || !selectedRole) return;
    
    try {
      await apiClient.post('/roles/assign', {
        userId: selectedUser._id,
        roleId: selectedRole
      });
      setShowUserRoleModal(false);
      setSelectedUser(null);
      setSelectedRole('');
      fetchUsers();
    } catch (error) {
      console.error('Error assigning role:', error);
    }
  };

  const handleRemoveRole = async (userId) => {
    try {
      await apiClient.post('/roles/remove', { userId });
      fetchUsers();
    } catch (error) {
      console.error('Error removing role:', error);
    }
  };

  const openEditRole = (role) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: role.description,
      permissions: { ...role.permissions }
    });
    setShowRoleForm(true);
  };

  const openUserRoleModal = (user) => {
    setSelectedUser(user);
    setSelectedRole(user.assignedRole?._id || '');
    setShowUserRoleModal(true);
  };

  const togglePermission = (category, permission) => {
    setRoleForm(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [permission]: !prev.permissions[permission]
      }
    }));
  };

  return (
    <>
      <section className='bg-white rounded-xl shadow p-5'>
        <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Role & Permissions</h2>
            <p className="mt-1 text-gray-600">Manage user roles and permissions for your team</p>
          </div>
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
              {roles.length} Roles
            </div>
            <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
              {users.filter(u => u.role === 'employee').length} Employees
            </div>
          </div>
        </div>

        {/* Enhanced Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('roles')}
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === 'roles'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <HiOutlineKey className="h-5 w-5" />
              <span>Manage Roles</span>
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <HiOutlineUser className="h-5 w-5" />
              <span>Assign Roles</span>
            </button>
          </nav>
        </div>

        {/* Roles Tab */}
        {activeTab === 'roles' && (
          <div className="space-y-6">
            {/* Header with Create Button */}
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Role Management</h3>
                <p className="text-gray-600">Create and manage custom roles with specific permissions</p>
              </div>
              <button
                onClick={() => {
                  setEditingRole(null);
                  setRoleForm({ name: '', description: '', permissions: {} });
                  setShowRoleForm(true);
                }}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <HiOutlinePlus className="h-4 w-4 mr-2" />
                Create New Role
              </button>
            </div>

            {/* Roles Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {roles.map((role) => (
                <div key={role._id} className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-lg font-semibold text-gray-900">{role.name}</h4>
                          {role.isSystem && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              System
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{role.description || 'No description'}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          role.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {role.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <span>Permissions</span>
                        <span className="font-medium text-gray-900">
                          {Object.values(role.permissions).filter(Boolean).length}
                        </span>
                      </div>
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${(Object.values(role.permissions).filter(Boolean).length / Object.keys(role.permissions).length) * 100}%` 
                          }}
                        ></div>
                      </div>
                    </div>

                    <div className="mt-6 flex items-center justify-between">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => openEditRole(role)}
                          className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          <HiOutlinePencil className="h-3 w-3 mr-1" />
                          Edit
                        </button>
                        {!role.isSystem && (
                          <button
                            onClick={() => handleDeleteRole(role._id)}
                            className="inline-flex items-center px-3 py-1.5 border border-red-300 shadow-sm text-xs font-medium rounded text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                          >
                            <HiOutlineTrash className="h-3 w-3 mr-1" />
                            Delete
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {role.createdAt ? new Date(role.createdAt).toLocaleDateString() : 'Unknown'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {roles.length === 0 && (
                <div className="col-span-full">
                  <div className="text-center py-12">
                    <HiOutlineKey className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No roles</h3>
                    <p className="mt-1 text-sm text-gray-500">Get started by creating a new role.</p>
                    <div className="mt-6">
                      <button
                        onClick={() => {
                          setEditingRole(null);
                          setRoleForm({ name: '', description: '', permissions: {} });
                          setShowRoleForm(true);
                        }}
                        className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                      >
                        <HiOutlinePlus className="h-4 w-4 mr-2" />
                        Create Role
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Header */}
            <div>
              <h3 className="text-xl font-semibold text-gray-900">User Role Assignments</h3>
              <p className="text-gray-600">Assign and manage roles for your team members</p>
            </div>
            
            {/* Users Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {users.filter(user => {
                console.log('User role:', user.role, 'User:', user.username); // Debug log
                return user.role === 'employee';
              }).map((user) => (
                <div key={user._id} className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                  <div className="p-6">
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div className="h-12 w-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                          <span className="text-white font-semibold text-lg">
                            {user.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="text-lg font-semibold text-gray-900 truncate">{user.username}</h4>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            Employee
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 truncate">{user.email}</p>
                        
                        <div className="mt-3">
                          {user.assignedRole ? (
                            <div className="flex items-center space-x-2">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                                <HiOutlineShieldCheck className="h-4 w-4 mr-1" />
                                {user.assignedRole.name}
                              </span>
                              {!user.assignedRole.isActive && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                  Inactive Role
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                              <HiOutlineX className="h-4 w-4 mr-1" />
                              No role assigned
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 flex items-center justify-between">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => openUserRoleModal(user)}
                          className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          <HiOutlineUser className="h-3 w-3 mr-1" />
                          {user.assignedRole ? 'Change Role' : 'Assign Role'}
                        </button>
                        {user.assignedRole && (
                          <button
                            onClick={() => handleRemoveRole(user._id)}
                            className="inline-flex items-center px-3 py-1.5 border border-red-300 shadow-sm text-xs font-medium rounded text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                          >
                            <HiOutlineX className="h-3 w-3 mr-1" />
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {users.filter(u => u.role === 'employee').length === 0 && (
                <div className="col-span-full">
                  <div className="text-center py-12">
                    <HiOutlineUser className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No employees</h3>
                    <p className="mt-1 text-sm text-gray-500">Create employee accounts to assign roles.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </section>

      {/* Role Form Modal */}
      {showRoleForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <HiOutlineKey className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {editingRole ? 'Edit Role' : 'Create New Role'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {editingRole ? 'Update role permissions and settings' : 'Define a new role with specific permissions'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowRoleForm(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <HiOutlineX className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-6 max-h-[calc(90vh-120px)] overflow-y-auto">
              {roleFormError && (
                <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
                  {roleFormError}
                </div>
              )}
              
              <form onSubmit={editingRole ? handleUpdateRole : handleCreateRole} className="space-y-6">
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Role Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={roleForm.name}
                      onChange={(e) => setRoleForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="Enter role name"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <select
                      value={roleForm.isActive !== undefined ? roleForm.isActive : true}
                      onChange={(e) => setRoleForm(prev => ({ ...prev, isActive: e.target.value === 'true' }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={roleForm.description}
                    onChange={(e) => setRoleForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    rows="3"
                    placeholder="Describe what this role is for..."
                  />
                </div>

                {/* Permissions Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-sm font-medium text-gray-700">Permissions</label>
                    <div className="text-sm text-gray-500">
                      {Object.values(roleForm.permissions).filter(Boolean).length} of {Object.keys(permissions).reduce((acc, cat) => acc + Object.keys(permissions[cat]).length, 0)} selected
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {Object.entries(permissions).map(([category, categoryPermissions]) => (
                      <div key={category} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-semibold text-gray-900 capitalize">
                            {category.replace(/([A-Z])/g, ' $1').trim()}
                          </h4>
                          <div className="text-xs text-gray-500">
                            {Object.entries(categoryPermissions).filter(([perm]) => roleForm.permissions[perm]).length} / {Object.keys(categoryPermissions).length}
                          </div>
                        </div>
                        <div className="space-y-3">
                          {Object.entries(categoryPermissions).map(([permission, description]) => (
                            <label key={permission} className="flex items-start space-x-3 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={roleForm.permissions[permission] || false}
                                onChange={() => togglePermission(category, permission)}
                                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              />
                              <div className="flex-1">
                                <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                                  {description}
                                </span>
                                <div className="text-xs text-gray-500 mt-1">
                                  {permission}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowRoleForm(false)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={editingRole ? handleUpdateRole : handleCreateRole}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors inline-flex items-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <HiOutlineCheck className="h-4 w-4 mr-2" />
                    {editingRole ? 'Update Role' : 'Create Role'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Role Assignment Modal */}
      {showUserRoleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                    <HiOutlineUser className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Assign Role</h3>
                    <p className="text-sm text-gray-600">Assign a role to this user</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowUserRoleModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <HiOutlineX className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-6">
              <div className="space-y-6">
                {/* User Info */}
                <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                    <span className="text-white font-semibold text-lg">
                      {selectedUser?.username?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{selectedUser?.username}</h4>
                    <p className="text-sm text-gray-600">{selectedUser?.email}</p>
                  </div>
                </div>

                {/* Current Role */}
                {selectedUser?.assignedRole && (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <HiOutlineShieldCheck className="h-5 w-5 text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">Current Role:</span>
                      <span className="text-sm text-blue-800">{selectedUser.assignedRole.name}</span>
                    </div>
                  </div>
                )}

                {/* Role Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Choose a role...</option>
                    {roles.filter(role => role.isActive).map(role => (
                      <option key={role._id} value={role._id}>
                        {role.name} {role.isSystem && '(System)'}
                      </option>
                    ))}
                  </select>
                  
                  {selectedRole && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">
                        <strong>Selected Role:</strong> {roles.find(r => r._id === selectedRole)?.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {Object.values(roles.find(r => r._id === selectedRole)?.permissions || {}).filter(Boolean).length} permissions
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
              <button
                onClick={() => setShowUserRoleModal(false)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignRole}
                disabled={!selectedRole}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors inline-flex items-center"
              >
                <HiOutlineCheck className="h-4 w-4 mr-2" />
                Assign Role
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RoleManagement;
