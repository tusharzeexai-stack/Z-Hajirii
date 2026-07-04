import { useState } from 'react';
import { Search, Bell, Settings, Menu, User, Check, Trash2, ClipboardCheck, AlertCircle, ShieldAlert } from 'lucide-react';
import { NotificationRecord } from '../types';

interface HeaderProps {
  onMobileMenuToggle: () => void;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  placeholder?: string;
  notifications: NotificationRecord[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClearNotifications: () => void;
  currentUser: {
    fullName: string;
    role: string;
    avatarUrl?: string;
  } | null;
  onSettingsClick?: () => void;
}

export default function Header({
  onMobileMenuToggle,
  searchTerm,
  onSearchChange,
  placeholder = 'Search...',
  notifications,
  onMarkRead,
  onMarkAllRead,
  onClearNotifications,
  currentUser,
  onSettingsClick
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const getIconForNotification = (type: string) => {
    switch (type) {
      case 'Task':
        return <ClipboardCheck className="w-4 h-4 text-blue-500" />;
      case 'Leave':
        return <AlertCircle className="w-4 h-4 text-emerald-500" />;
      default:
        return <ShieldAlert className="w-4 h-4 text-amber-500" />;
    }
  };

  return (
    <header className="flex justify-between items-center w-full px-4 sm:px-6 lg:pl-72 h-16 sticky top-0 z-40 bg-surface-container-lowest/90 backdrop-blur-md border-b border-outline-variant">
      <div className="flex items-center gap-2 sm:gap-4 flex-1">
        <button
          onClick={onMobileMenuToggle}
          className="lg:hidden p-2 hover:bg-surface-container-low rounded-full text-primary"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="relative w-full max-w-xs sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-surface-container-low border border-outline-variant rounded-full py-2 pl-10 pr-4 font-normal text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder={placeholder}
          />
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2 relative">
        {/* Notification Bell */}
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="hover:bg-surface-container-low rounded-full p-2 text-on-surface-variant relative active:scale-95 transition-transform"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 bg-error text-white font-bold text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-surface-container-lowest animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>

        {/* Notifications Dropdown */}
        {dropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-transparent"
              onClick={() => setDropdownOpen(false)}
            />
            <div className="absolute top-full right-0 mt-2 z-50 bg-white rounded-xl border border-outline-variant p-2 shadow-xl w-[320px] max-h-[400px] overflow-y-auto flex flex-col text-on-surface animate-bounce-short">
              <div className="flex items-center justify-between p-2 border-b border-outline-variant/30">
                <span className="font-bold text-sm text-primary">Notifications ({unreadCount})</span>
                <div className="flex gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={() => {
                        onMarkAllRead();
                      }}
                      title="Mark all as read"
                      className="p-1 hover:bg-emerald-50 text-emerald-600 rounded"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      onClick={() => {
                        onClearNotifications();
                      }}
                      title="Clear all"
                      className="p-1 hover:bg-red-50 text-error rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-outline-variant/20 max-h-[300px]">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-xs text-on-surface-variant font-medium">
                    No new notifications
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        onMarkRead(n.id);
                      }}
                      className={`p-3 text-xs flex gap-2.5 items-start hover:bg-primary/5 cursor-pointer transition-all ${
                        !n.isRead ? 'bg-primary-container/10 font-semibold' : ''
                      }`}
                    >
                      <div className="mt-0.5">{getIconForNotification(n.type)}</div>
                      <div className="flex-1">
                        <p className="text-on-surface font-bold">{n.title}</p>
                        <p className="text-on-surface-variant text-[11px] font-normal leading-relaxed mt-0.5">{n.message}</p>
                        {n.createdAt && (
                          <span className="text-[10px] text-on-surface-variant/60 block mt-1">
                            {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0 self-center"></span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {/* Settings button */}
        <button
          onClick={onSettingsClick}
          className="hover:bg-surface-container-low rounded-full p-2 text-on-surface-variant active:scale-95 transition-transform"
        >
          <Settings className="w-5 h-5" />
        </button>

        <div className="h-8 w-px bg-outline-variant mx-1"></div>

        {/* User profile quick view */}
        <div className="flex items-center gap-2 pl-1 select-none">
          {currentUser?.avatarUrl ? (
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.fullName}
              className="w-8 h-8 rounded-full object-cover border border-primary/20"
            />
          ) : (
            <div className="w-8 h-8 rounded-full border border-primary/20 bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <User className="w-4 h-4" />
            </div>
          )}
          <div className="hidden md:block max-w-[120px]">
            <p className="text-xs font-bold text-primary truncate leading-tight">
              {currentUser ? currentUser.fullName : 'Guest'}
            </p>
            <p className="text-[9px] text-on-surface-variant font-semibold uppercase tracking-wider truncate">
              {currentUser ? currentUser.role : 'Offline'}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
