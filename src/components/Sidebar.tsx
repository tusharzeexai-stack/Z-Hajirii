import {
  LayoutDashboard,
  LogOut,
  Users as UsersIcon,
  FileBarChart,
  ClipboardCheck,
  User,
  ListTodo,
  Clock,
  CheckSquare,
  Calendar,
  Settings,
  FileText,
  Award
} from 'lucide-react';
import { ViewTab } from '../types';

// @ts-ignore
import logoUrl from '@/assets/Zeex-AI logo .png';

interface SidebarProps {
  currentTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  onLogout: () => void;
  selectedUserForProfileName?: string;
  currentUser: {
    fullName: string;
    role: 'Employee' | 'Admin' | 'Team Leader';
    designation: string;
    avatarUrl?: string;
  } | null;
}

export default function Sidebar({
  currentTab,
  onTabChange,
  onLogout,
  selectedUserForProfileName,
  currentUser
}: SidebarProps) {
  const role = currentUser?.role || 'Employee';

  return (
    <aside className="hidden lg:flex flex-col h-screen fixed left-0 top-0 w-64 bg-surface-container-lowest shadow-sm border-r border-outline-variant z-50">
      <div className="p-6 flex flex-col items-center text-center gap-2 border-b border-outline-variant/30 bg-surface-container-low/10">
        <div className="bg-white p-2 rounded-xl border border-outline-variant shadow-sm flex items-center justify-center">
          <img src={logoUrl} alt="Zeex-AI Logo" className="w-20 h-auto object-contain" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-primary tracking-tight">Z-Hajirii</h2>
          <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider">Attendance & HR System</p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto">
        {role === 'Admin' ? (
          <>
            {/* ADMIN TABS */}
            <button
              onClick={() => onTabChange('Dashboard')}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-left group ${
                currentTab === 'Dashboard'
                  ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
              }`}
            >
              <LayoutDashboard className={`w-5 h-5 ${currentTab === 'Dashboard' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">Dashboard</span>
            </button>

            <button
              onClick={() => onTabChange('Attendance')}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-left group ${
                currentTab === 'Attendance'
                  ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
              }`}
            >
              <ClipboardCheck className={`w-5 h-5 ${currentTab === 'Attendance' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">Attendance</span>
            </button>

            <button
              onClick={() => onTabChange('UserManagement')}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-left group ${
                currentTab === 'UserManagement'
                  ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
              }`}
            >
              <UsersIcon className={`w-5 h-5 ${currentTab === 'UserManagement' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">User Management</span>
            </button>

            <button
              onClick={() => onTabChange('LeaveManagement')}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-left group ${
                currentTab === 'LeaveManagement'
                  ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
              }`}
            >
              <Calendar className={`w-5 h-5 ${currentTab === 'LeaveManagement' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">Leave Management</span>
            </button>

            <button
              onClick={() => onTabChange('AdminTeamLeaders')}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-left group ${
                currentTab === 'AdminTeamLeaders'
                  ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
              }`}
            >
              <Award className={`w-5 h-5 ${currentTab === 'AdminTeamLeaders' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">Team Leaders</span>
            </button>

            <button
              onClick={() => onTabChange('AdminTLTasks')}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-left group ${
                currentTab === 'AdminTLTasks'
                  ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
              }`}
            >
              <ListTodo className={`w-5 h-5 ${currentTab === 'AdminTLTasks' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">TL Tasks</span>
            </button>

            <button
              onClick={() => onTabChange('Reports')}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-left group ${
                currentTab === 'Reports'
                  ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
              }`}
            >
              <FileBarChart className={`w-5 h-5 ${currentTab === 'Reports' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">
                {selectedUserForProfileName ? `${selectedUserForProfileName}'s Profile` : 'Report Profile'}
              </span>
            </button>
          </>
        ) : (
          <>
            {/* EMPLOYEE & MANAGER TABS */}
            <button
              onClick={() => onTabChange('EmpDashboard')}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-left group ${
                currentTab === 'EmpDashboard'
                  ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
              }`}
            >
              <LayoutDashboard className={`w-5 h-5 ${currentTab === 'EmpDashboard' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">Dashboard</span>
            </button>

            {role === 'Team Leader' && (
              <button
                onClick={() => onTabChange('TeamLeaderDashboard')}
                className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-left group ${
                  currentTab === 'TeamLeaderDashboard'
                    ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
                    : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
                }`}
              >
                <UsersIcon className={`w-5 h-5 ${currentTab === 'TeamLeaderDashboard' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
                <span className="font-semibold text-sm">Team Leader</span>
              </button>
            )}

            <button
              onClick={() => onTabChange('MyTasks')}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-left group ${
                currentTab === 'MyTasks'
                  ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
              }`}
            >
              <ListTodo className={`w-5 h-5 ${currentTab === 'MyTasks' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">My Tasks</span>
            </button>

            <button
              onClick={() => onTabChange('PendingTasks')}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-left group ${
                currentTab === 'PendingTasks'
                  ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
              }`}
            >
              <Clock className={`w-5 h-5 ${currentTab === 'PendingTasks' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">Pending Tasks</span>
            </button>

            <button
              onClick={() => onTabChange('CompletedTasks')}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-left group ${
                currentTab === 'CompletedTasks'
                  ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
              }`}
            >
              <CheckSquare className={`w-5 h-5 ${currentTab === 'CompletedTasks' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">Completed Tasks</span>
            </button>

            <button
              onClick={() => onTabChange('LeaveRequests')}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-left group ${
                currentTab === 'LeaveRequests'
                  ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
              }`}
            >
              <FileText className={`w-5 h-5 ${currentTab === 'LeaveRequests' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">Leave Requests</span>
            </button>

            <button
              onClick={() => onTabChange('ApprovedLeaves')}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-left group ${
                currentTab === 'ApprovedLeaves'
                  ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
              }`}
            >
              <Calendar className={`w-5 h-5 ${currentTab === 'ApprovedLeaves' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">Approved Leaves</span>
            </button>

            <button
              onClick={() => onTabChange('EmpProfile')}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-left group ${
                currentTab === 'EmpProfile'
                  ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
              }`}
            >
              <User className={`w-5 h-5 ${currentTab === 'EmpProfile' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">My Profile</span>
            </button>

            <button
              onClick={() => onTabChange('EmpSettings')}
              className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-all text-left group ${
                currentTab === 'EmpSettings'
                  ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
              }`}
            >
              <Settings className={`w-5 h-5 ${currentTab === 'EmpSettings' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
              <span className="font-semibold text-sm">Settings</span>
            </button>
          </>
        )}
      </nav>

      <div className="p-6 border-t border-outline-variant space-y-4">
        {/* Logout */}
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-4 py-2 text-error hover:bg-error-container/15 rounded-lg transition-all w-full text-left group active:scale-95 cursor-pointer"
        >
          <LogOut className="w-5 h-5 text-error group-hover:scale-110 transition-transform" />
          <span className="font-bold text-sm">Logout</span>
        </button>

        {/* User profile info */}
        <div className="flex items-center gap-3 pt-2">
          {currentUser?.avatarUrl ? (
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.fullName}
              className="w-10 h-10 rounded-full object-cover border border-primary/20"
            />
          ) : (
            <div className="w-10 h-10 rounded-full border border-primary/20 bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <User className="w-5 h-5" />
            </div>
          )}
          <div className="overflow-hidden">
            <p className="font-bold text-sm text-primary truncate">
              {currentUser ? currentUser.fullName : 'Guest User'}
            </p>
            <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider truncate">
              {currentUser ? currentUser.designation : 'Offline'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
