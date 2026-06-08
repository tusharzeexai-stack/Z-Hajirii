import { LayoutDashboard, LogIn, Users as UsersIcon, FileBarChart, LogOut, ClipboardCheck } from 'lucide-react';
import { ViewTab } from '../types';

// @ts-ignore
import logoUrl from '@/assets/Zeex-AI logo .png';

interface SidebarProps {
  currentTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  onLogout: () => void;
  selectedUserForProfileName?: string;
}

export default function Sidebar({ currentTab, onTabChange, onLogout, selectedUserForProfileName }: SidebarProps) {
  return (
    <aside className="hidden lg:flex flex-col h-screen fixed left-0 top-0 w-64 bg-surface-container-lowest shadow-sm border-r border-outline-variant z-50">
      <div className="p-6 flex flex-col items-center text-center gap-2 border-b border-outline-variant/30 bg-surface-container-low/10">
        <div className="bg-white p-2 rounded-xl border border-outline-variant shadow-sm flex items-center justify-center">
          <img src={logoUrl} alt="Zeex-AI Logo" className="w-20 h-auto object-contain" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-primary tracking-tight">Z-Hajirii</h2>
          <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider">Attendance System</p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1 mt-4">
        {/* Dashboard Tab */}
        <button
          onClick={() => onTabChange('Dashboard')}
          className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-all text-left group ${
            currentTab === 'Dashboard'
              ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
              : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
          }`}
        >
          <LayoutDashboard className={`w-5 h-5 ${currentTab === 'Dashboard' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
          <span className="font-semibold text-sm">Dashboard</span>
        </button>

        {/* Attendance Tab */}
        <button
          onClick={() => onTabChange('Attendance')}
          className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-all text-left group ${
            currentTab === 'Attendance'
              ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
              : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
          }`}
        >
          <ClipboardCheck className={`w-5 h-5 ${currentTab === 'Attendance' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
          <span className="font-semibold text-sm">Attendance</span>
        </button>

        {/* Users Tab */}
        <button
          onClick={() => onTabChange('Users')}
          className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-all text-left group ${
            currentTab === 'Users'
              ? 'text-primary bg-surface-container-high border-l-4 border-primary font-bold'
              : 'text-on-surface-variant hover:bg-surface-container-low hover:text-primary'
          }`}
        >
          <UsersIcon className={`w-5 h-5 ${currentTab === 'Users' ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`} />
          <span className="font-semibold text-sm">Users</span>
        </button>

        {/* Reports / Profile Tab */}
        <button
          onClick={() => onTabChange('Reports')}
          className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-all text-left group ${
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
      </nav>

      <div className="p-6 border-t border-outline-variant space-y-4">
        {/* Logout Trigger */}
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-4 py-3 text-error hover:bg-error-container/15 rounded-lg transition-all w-full text-left group active:scale-95"
        >
          <LogOut className="w-5 h-5 text-error group-hover:scale-110 transition-transform" />
          <span className="font-bold text-sm">Logout</span>
        </button>

        {/* Logged in Admin profile info */}
        <div className="flex items-center gap-3 pt-2">
          <img
            alt="Admin User Profile"
            className="w-10 h-10 rounded-full border border-primary/20 object-cover"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBo5nlil7m-Lv_jDtjTTZdy1TSVgSkLZsS5GwPpdHkfyLKgc1oNQn81wRXC5NDYLDbTLQ0NaodeeXsv1jN84GillMmzs5Fg11YxwP9N1lfxwxei9rsbhVbTxs6IhjqvFT9XBfxbuN87ZstWNgH0tbIq0HzV0oc0c8JlTOoTg_ssCejlQ6u2qcM6Wa4Xw6HN2oNz7xx-T_EeD3l2FVbxuz4Gv14TBImn_pkzcR7IfB3i-xNGUe0QfWlOGZyvdo9U8WpxA1LgJ3BmEYM"
          />
          <div className="overflow-hidden">
            <p className="font-bold text-sm text-primary truncate">Admin User</p>
            <p className="text-[11px] text-on-surface-variant font-medium truncate">System Manager</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
