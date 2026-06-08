import { Search, Bell, Settings, Menu } from 'lucide-react';

interface HeaderProps {
  onMobileMenuToggle: () => void;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  placeholder?: string;
}

export default function Header({ onMobileMenuToggle, searchTerm, onSearchChange, placeholder = 'Search employees...' }: HeaderProps) {
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

      <div className="flex items-center gap-1 sm:gap-2">
        <button className="hover:bg-surface-container-low rounded-full p-2 text-on-surface-variant relative hidden sm:block">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-error rounded-full ring-2 ring-surface-container-lowest animate-pulse"></span>
        </button>
        <button className="hover:bg-surface-container-low rounded-full p-2 text-on-surface-variant hidden sm:block">
          <Settings className="w-5 h-5" />
        </button>
        <div className="h-8 w-px bg-outline-variant mx-1 sm:mx-2 hidden sm:block"></div>
        <img
          alt="User Avatar"
          className="w-8 h-8 rounded-full border border-primary/20 object-cover"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuCkZwRbUnvhvgdboGhWLfdGjG0z_AS8emS75B2q4jKx3NtyyLy8-Eh49TOdEMZHOLmnxIY1j30k5yCCKYbrMIYZGrb5157wYu-_9JyPjdkrQWREJYHgC5DjLADK2Oxryq0oUeQn-mc-ONqskclb08uQpQg7IpswYLl66RhxQ6haWr_Fte4K__jF7GnHgPBYpJez0i2It8lTn-2GA4s6WPB3foVV9DFv970e8ZicKVUWD_j0IXupgu9JGSj4LiH-fJmmXz1OU0R5Ewo"
        />
      </div>
    </header>
  );
}
