import { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Filter,
  UserCheck,
  Globe,
  MapPin,
  ExternalLink,
  Calendar,
  Mail,
  Phone,
  Briefcase,
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  GraduationCap
} from 'lucide-react';
import { UserRecord, Employee } from '../types';

interface ZLabHiredProps {
  users: UserRecord[];
  employees: Employee[];
  onViewAttendanceProfile?: (user: UserRecord) => void;
  onToggleUserStatus?: (user: UserRecord) => void;
  onDeleteUser?: (userId: string) => void;
}

export default function ZLabHired({
  users,
  employees,
  onViewAttendanceProfile,
  onToggleUserStatus,
  onDeleteUser
}: ZLabHiredProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [domainFilter, setDomainFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Filter users that are migrated from Z-Lab Portal
  const zLabHiredUsers = useMemo(() => {
    return users.filter((u) => {
      const isMigrated =
        u.department === 'Z-Lab Hired' ||
        (u.employeeId && u.employeeId.startsWith('ZH-INT-')) ||
        (u.id && u.id.startsWith('zh-int-'));
      return isMigrated;
    });
  }, [users]);

  // Unique domains for filter dropdown
  const uniqueDomains = useMemo(() => {
    const set = new Set<string>();
    zLabHiredUsers.forEach((u) => {
      if (u.designation) set.add(u.designation);
    });
    return ['All', ...Array.from(set)];
  }, [zLabHiredUsers]);

  // Filtered dataset
  const filteredUsers = useMemo(() => {
    return zLabHiredUsers.filter((user) => {
      const matchesSearch =
        user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.employeeId && user.employeeId.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (user.designation && user.designation.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesDomain = domainFilter === 'All' || user.designation === domainFilter;
      const matchesStatus =
        statusFilter === 'All' ||
        (statusFilter === 'Active' && user.status.toLowerCase() === 'active') ||
        (statusFilter === 'Disabled' && user.status.toLowerCase() === 'disabled');

      return matchesSearch && matchesDomain && matchesStatus;
    });
  }, [zLabHiredUsers, searchTerm, domainFilter, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = zLabHiredUsers.length;
    const active = zLabHiredUsers.filter((u) => u.status.toLowerCase() === 'active').length;
    const online = zLabHiredUsers.filter((u) => u.internType === 'Online Intern').length;
    const offline = zLabHiredUsers.filter((u) => u.internType === 'Offline Intern').length;
    return { total, active, online, offline };
  }, [zLabHiredUsers]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 rounded-2xl border border-primary/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/25 shrink-0">
            <GraduationCap className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-on-surface tracking-tight flex items-center gap-2">
              Z-Lab Hired Directory
              <span className="text-xs bg-primary/10 text-primary font-bold px-2.5 py-1 rounded-full border border-primary/20">
                Z-Lab Portal Migration
              </span>
            </h1>
            <p className="text-sm text-on-surface-variant font-medium mt-0.5">
              Manage and track interns migrated from Z-Lab Portal into Z-Hajirii attendance framework.
            </p>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Total Hired</span>
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-on-surface mt-3">{stats.total}</p>
          <p className="text-xs text-on-surface-variant font-medium mt-1">Migrated from Z-Lab Portal</p>
        </div>

        <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider font-semibold">Active Status</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-emerald-600 mt-3">{stats.active}</p>
          <p className="text-xs text-on-surface-variant font-medium mt-1">Currently active interns</p>
        </div>

        <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Online Interns</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600">
              <Globe className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-blue-600 mt-3">{stats.online}</p>
          <p className="text-xs text-on-surface-variant font-medium mt-1">Remote / Online mode</p>
        </div>

        <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Offline Interns</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600">
              <MapPin className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-purple-600 mt-3">{stats.offline}</p>
          <p className="text-xs text-on-surface-variant font-medium mt-1">In-office mode</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, email, EMP ID, domain..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-surface-container-low rounded-xl border border-outline-variant text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-on-surface-variant shrink-0" />
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="bg-surface-container-low text-xs font-semibold px-3 py-2 rounded-xl border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary/20 text-on-surface"
            >
              {uniqueDomains.map((d) => (
                <option key={d} value={d}>
                  Domain: {d}
                </option>
              ))}
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface-container-low text-xs font-semibold px-3 py-2 rounded-xl border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary/20 text-on-surface"
          >
            <option value="All">Status: All</option>
            <option value="Active">Status: Active</option>
            <option value="Disabled">Status: Disabled</option>
          </select>
        </div>
      </div>

      {/* Intern Table */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="py-16 px-6 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center mx-auto">
              <GraduationCap className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-on-surface">No Z-Lab Hired Interns Found</h3>
            <p className="text-sm text-on-surface-variant max-w-md mx-auto font-medium">
              {zLabHiredUsers.length === 0
                ? 'No interns have been migrated from Z-Lab Portal yet. Click "Migrate" on an intern in the Z-Lab Portal to automatically sync them here.'
                : 'No records match your search criteria.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/60 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                  <th className="py-3.5 px-5">Intern Detail</th>
                  <th className="py-3.5 px-4">Employee ID</th>
                  <th className="py-3.5 px-4">Domain / Role</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Joining Date</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 text-sm font-medium">
                {filteredUsers.map((user) => {
                  const empId = user.employeeId || `ZH-INT-${user.id.replace('zh-int-', '')}`;
                  const isActive = user.status.toLowerCase() === 'active';

                  return (
                    <tr key={user.id} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 text-primary font-bold flex items-center justify-center shrink-0 text-sm">
                            {user.fullName
                              ? user.fullName
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .toUpperCase()
                                  .slice(0, 2)
                              : 'INT'}
                          </div>
                          <div>
                            <div className="font-bold text-on-surface">{user.fullName}</div>
                            <div className="text-xs text-on-surface-variant flex items-center gap-1.5 mt-0.5">
                              <Mail className="w-3 h-3" />
                              <span>{user.email}</span>
                            </div>
                            {user.phoneNumber && (
                              <div className="text-[11px] text-on-surface-variant/80 flex items-center gap-1.5 mt-0.5">
                                <Phone className="w-3 h-3" />
                                <span>{user.phoneNumber}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 font-mono text-xs font-bold text-primary">
                        <span className="px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20">
                          {empId}
                        </span>
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5">
                          <Briefcase className="w-4 h-4 text-on-surface-variant" />
                          <span className="font-semibold text-on-surface">{user.designation || 'Intern'}</span>
                        </div>
                        <div className="text-xs text-on-surface-variant mt-0.5">{user.department}</div>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${
                            user.internType === 'Offline Intern'
                              ? 'bg-purple-500/10 text-purple-700 border-purple-200'
                              : 'bg-blue-500/10 text-blue-700 border-blue-200'
                          }`}
                        >
                          {user.internType === 'Offline Intern' ? (
                            <MapPin className="w-3 h-3" />
                          ) : (
                            <Globe className="w-3 h-3" />
                          )}
                          {user.internType || 'Online Intern'}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-xs font-semibold text-on-surface-variant">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-on-surface-variant" />
                          <span>{user.joiningDate || '—'}</span>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${
                            isActive
                              ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200'
                              : 'bg-red-500/10 text-red-700 border-red-200'
                          }`}
                        >
                          {isActive ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          {isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>

                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {onViewAttendanceProfile && (
                            <button
                              onClick={() => onViewAttendanceProfile(user)}
                              className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                              title="View Attendance & Profile"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Profile</span>
                            </button>
                          )}

                          {onToggleUserStatus && (
                            <button
                              onClick={() => onToggleUserStatus(user)}
                              className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                                isActive
                                  ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                  : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}
                              title={isActive ? 'Disable User' : 'Activate User'}
                            >
                              {isActive ? 'Disable' : 'Activate'}
                            </button>
                          )}

                          {onDeleteUser && (
                            <button
                              onClick={() => onDeleteUser(user.id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Intern Record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
