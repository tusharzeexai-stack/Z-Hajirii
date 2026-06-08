import { useState, useMemo, useEffect, FormEvent } from 'react';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  HelpCircle,
  Plus,
  Trash2,
  Edit2,
  Filter,
  Download,
  Check,
  X,
  Clock,
  Briefcase,
  AlertCircle,
  TrendingUp,
  FileText,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  LogOut,
  Calendar
} from 'lucide-react';
import { Employee, AttendanceRecord, ViewTab } from './types';
import { INITIAL_EMPLOYEES, INITIAL_ATTENDANCE_LOGS } from './data';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { supabase } from './supabaseClient';

// @ts-ignore
import logoUrl from '@/assets/Zeex-AI logo .png';

// Helper to calculate total hours dynamically based on in and out times
const calculateDuration = (inTime: string, outTime: string) => {
  if (inTime === '--:--' || outTime === '--:--') return '0h 00m';
  try {
    const parseTime = (t: string) => {
      const parts = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!parts) return 0;
      let hours = parseInt(parts[1], 10);
      const minutes = parseInt(parts[2], 10);
      const modifier = parts[3].toUpperCase();
      if (modifier === 'PM' && hours < 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    };
    const diff = parseTime(outTime) - parseTime(inTime);
    if (diff <= 0) return '0h 00m';
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return `${h}h ${m}m`;
  } catch (err) {
    console.error(err);
    return '0h 00m';
  }
};

const parseDateString = (dateStr: string): Date => {
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
};

const formatDateString = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const AVAILABLE_ROLES = [
  'Software Engineer',
  'AI Engineer',
  'System Architect',
  'Senior Operations Manager',
  'Operations Lead',
  'HR Manager',
  'Administrator',
  'Payroll Lead',
  'Benefits Coordinator',
  'Talent Acquisition'
];

export default function App() {
  const todayDateString = useMemo(() => {
    return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  const todayFullDateString = useMemo(() => {
    return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }, []);

  // Authentication State
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(true); // Logged in by default so the user sees the dashboard, but can logout
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('Zeexai@admin');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(true);

  // Core Management State
  const [currentTab, setCurrentTab] = useState<ViewTab>('Dashboard');
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>(INITIAL_ATTENDANCE_LOGS);
  const [selectedEmployeeForProfile, setSelectedEmployeeForProfile] = useState<Employee | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Global Search / Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('All Roles');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Attendance Tab Filters
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState<string>(todayDateString);
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState<string>('All Statuses');

  // Unique Dates for Attendance filter dropdown
  const uniqueAttendanceDates = useMemo(() => {
    const datesSet = new Set(attendanceLogs.map(l => l.date));
    datesSet.add(todayDateString); // always include today
    return Array.from(datesSet).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [attendanceLogs, todayDateString]);

  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(false);
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(() => parseDateString(selectedAttendanceDate));

  // Sync calendarViewDate when selectedAttendanceDate changes
  useEffect(() => {
    setCalendarViewDate(parseDateString(selectedAttendanceDate));
  }, [selectedAttendanceDate]);

  const calendarDays = useMemo(() => {
    const viewYear = calendarViewDate.getFullYear();
    const viewMonth = calendarViewDate.getMonth();
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevTotalDays = new Date(viewYear, viewMonth, 0).getDate();

    const daysList = [];
    // Previous trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      daysList.push({
        day: prevTotalDays - i,
        month: viewMonth === 0 ? 11 : viewMonth - 1,
        year: viewMonth === 0 ? viewYear - 1 : viewYear,
        isCurrentMonth: false
      });
    }
    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      daysList.push({
        day: i,
        month: viewMonth,
        year: viewYear,
        isCurrentMonth: true
      });
    }
    // Next leading days
    const remaining = 42 - daysList.length;
    for (let i = 1; i <= remaining; i++) {
      daysList.push({
        day: i,
        month: viewMonth === 11 ? 0 : viewMonth + 1,
        year: viewMonth === 11 ? viewYear + 1 : viewYear,
        isCurrentMonth: false
      });
    }
    return daysList;
  }, [calendarViewDate]);

  // Filtered Attendance Tab Employees list
  const filteredAttendanceEmployees = useMemo(() => {
    return employees.filter(emp => {
      const log = attendanceLogs.find(l => l.employeeId === emp.id && l.date === selectedAttendanceDate);
      const status = log ? log.status : 'Absent';

      const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.empId.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = attendanceStatusFilter === 'All Statuses' || status === attendanceStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [employees, attendanceLogs, selectedAttendanceDate, attendanceStatusFilter, searchTerm]);

  // New Employee Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [newEmpName, setNewEmpName] = useState<string>('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['Software Engineer']);
  const [newEmpEmail, setNewEmpEmail] = useState<string>('');
  const [newEmpId, setNewEmpId] = useState<string>('');
  const [newEmpAvatar, setNewEmpAvatar] = useState<string>('');

  // Toast Feedback State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Fetch employees and attendance logs from Supabase
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch employees
      const { data: empData, error: empError } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (empError) throw empError;
      
      const mappedEmployees: Employee[] = (empData || []).map(emp => ({
        id: emp.id,
        name: emp.name,
        role: emp.role,
        email: emp.email,
        avatarUrl: emp.avatar_url,
        empId: emp.emp_id,
        activeNow: emp.active_now
      }));
      
      // Fetch attendance logs
      const { data: logData, error: logError } = await supabase
        .from('attendance_logs')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (logError) throw logError;
      
      const mappedLogs: AttendanceRecord[] = (logData || []).map(log => ({
        id: log.id,
        employeeId: log.employee_id,
        date: log.date,
        clockIn: log.clock_in,
        clockOut: log.clock_out,
        totalHours: log.total_hours,
        status: log.status
      }));
      
      setEmployees(mappedEmployees);
      setAttendanceLogs(mappedLogs);
      
      // Select first employee for profile if none selected
      if (mappedEmployees.length > 0) {
        setSelectedEmployeeForProfile(prev => {
          if (prev) {
            // keep previous selected if it still exists
            const stillExists = mappedEmployees.find(e => e.id === prev.id);
            return stillExists || mappedEmployees[0];
          }
          return mappedEmployees[0];
        });
      } else {
        setSelectedEmployeeForProfile(null);
      }
    } catch (err) {
      console.error('Error fetching from Supabase:', err);
      showToast('Error syncing with database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    if (username.trim() === 'admin' && password === 'Zeexai@admin') {
      setIsLoggedIn(true);
      setLoginError('');
      showToast('Successfully authenticated as admin.');
    } else {
      setLoginError('Invalid username or password. Please use admin / Zeexai@admin');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    showToast('Logged out successfully.');
  };

  // Create new Employee flow
  const handleCreateEmployee = async (e: FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim() || !newEmpEmail.trim() || !newEmpId.trim()) {
      showToast('Please fill in all required fields.');
      return;
    }

    const newEmpIdStr = `emp-${Date.now()}`;
    const avatar = newEmpAvatar.trim() || `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 999999)}?auto=format&fit=crop&q=80&w=150`;

    const dbEmp = {
      id: newEmpIdStr,
      name: newEmpName.trim(),
      role: selectedRoles.join(', '),
      email: newEmpEmail.trim(),
      emp_id: newEmpId.trim().toUpperCase(),
      avatar_url: avatar,
      active_now: true
    };

    try {
      const { error: empErr } = await supabase.from('employees').insert(dbEmp);
      if (empErr) throw empErr;

      // Also auto-create a default Present log for today
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const dbLog = {
        id: `rec-${Date.now()}`,
        employee_id: newEmpIdStr,
        date: todayDateString,
        clock_in: timeStr,
        clock_out: '--:--',
        total_hours: '0h 00m',
        status: 'Present'
      };
      
      const { error: logErr } = await supabase.from('attendance_logs').insert(dbLog);
      if (logErr) throw logErr;

      setIsCreateModalOpen(false);
      // Reset forms
      setNewEmpName('');
      setSelectedRoles(['Software Engineer']);
      setNewEmpEmail('');
      setNewEmpId('');
      setNewEmpAvatar('');
      showToast(`Employee ${dbEmp.name} created successfully!`);
      
      await fetchData();
    } catch (err) {
      console.error(err);
      showToast('Failed to create employee in database.');
    }
  };

  // Delete employee flow
  const handleDeleteEmployee = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to remove ${name}?`)) {
      try {
        await supabase.from('attendance_logs').delete().eq('employee_id', id);
        const { error } = await supabase.from('employees').delete().eq('id', id);
        if (error) throw error;

        showToast(`Removed employee ${name}.`);
        setSelectedEmployeeForProfile(prev => prev?.id === id ? null : prev);
        await fetchData();
      } catch (err) {
        console.error(err);
        showToast('Failed to delete employee from database.');
      }
    }
  };

  // Change individual attendance record status
  const handleUpdateStatus = async (employeeId: string, status: 'Present' | 'Absent' | 'Late', dateString = todayDateString) => {
    const existingLog = attendanceLogs.find(log => log.employeeId === employeeId && log.date === dateString);

    if (existingLog && existingLog.status === status) {
      showToast(`Already marked as ${status} for today.`);
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    let clockIn = timeStr;
    let clockOut = '--:--';
    let totalHours = '0h 00m';

    if (status === 'Absent') {
      clockIn = '--:--';
      clockOut = '--:--';
      totalHours = '0h 00m';
    }

    try {
      if (existingLog) {
        const { error } = await supabase
          .from('attendance_logs')
          .update({
            status,
            clock_in: clockIn,
            clock_out: clockOut,
            total_hours: totalHours
          })
          .eq('id', existingLog.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('attendance_logs')
          .insert({
            id: `rec-${Date.now()}`,
            employee_id: employeeId,
            date: dateString,
            clock_in: clockIn,
            clock_out: clockOut,
            total_hours: totalHours,
            status
          });
        if (error) throw error;
      }

      showToast(`Status updated successfully.`);
      await fetchData();
    } catch (err) {
      console.error(err);
      showToast('Failed to update status in database.');
    }
  };

  // Save clock out time dynamically
  const handleClockOut = async (employeeId: string, dateString = todayDateString) => {
    const existingLog = attendanceLogs.find(log => log.employeeId === employeeId && log.date === dateString);
    if (!existingLog || existingLog.clockIn === '--:--') {
      showToast('User must clock in first.');
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const totalHours = calculateDuration(existingLog.clockIn, timeStr);

    try {
      const { error } = await supabase
        .from('attendance_logs')
        .update({
          clock_out: timeStr,
          total_hours: totalHours
        })
        .eq('id', existingLog.id);
      if (error) throw error;

      showToast(`User successfully clocked out at ${timeStr}.`);
      await fetchData();
    } catch (err) {
      console.error(err);
      showToast('Failed to save clock out time.');
    }
  };

  // Delete individual attendance log
  const handleDeleteAttendance = async (logId: string) => {
    if (window.confirm('Are you sure you want to delete this attendance log?')) {
      try {
        const { error } = await supabase
          .from('attendance_logs')
          .delete()
          .eq('id', logId);
        if (error) throw error;

        showToast('Attendance log deleted successfully.');
        await fetchData();
      } catch (err) {
        console.error(err);
        showToast('Failed to delete attendance log.');
      }
    }
  };

  // Filter Employees List based on search and roles dropdown
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.empId.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesRole = roleFilter === 'All Roles' || 
        (emp.role && emp.role.split(',').map(r => r.trim()).includes(roleFilter));

      return matchesSearch && matchesRole;
    });
  }, [employees, searchTerm, roleFilter]);

  // Dynamic Stats calculations (Present, Absent, Late) based on current state of employees & attendance logs
  const stats = useMemo(() => {
    const total = employees.length;
    let present = 0;
    let absent = 0;
    let late = 0;

    employees.forEach(emp => {
      // Find today's log
      const todayLog = attendanceLogs.find(log => log.employeeId === emp.id && log.date === todayDateString);
      if (todayLog) {
        if (todayLog.status === 'Present') present += 1;
        else if (todayLog.status === 'Absent') absent += 1;
        else if (todayLog.status === 'Late') late += 1;
      } else {
        // If no log is registered for today, assume absent or un-logged
        absent += 1;
      }
    });

    return {
      totalEmployees: total,
      present,
      absent,
      late
    };
  }, [employees, attendanceLogs]);

  // Dynamic profile report stats calculations for the selected employee
  const profileStats = useMemo(() => {
    if (!selectedEmployeeForProfile) {
      return {
        present: 0,
        absent: 0,
        late: 0,
        total: 0,
        rate: '0.0%',
        presentPercent: 0,
        latePercent: 0,
        absentPercent: 0
      };
    }

    const logs = attendanceLogs.filter(log => log.employeeId === selectedEmployeeForProfile.id);
    const total = logs.length;
    let present = 0;
    let absent = 0;
    let late = 0;

    logs.forEach(log => {
      if (log.status === 'Present') present += 1;
      else if (log.status === 'Absent') absent += 1;
      else if (log.status === 'Late') late += 1;
    });

    const rate = total > 0 ? ((present + late) / total * 100).toFixed(1) + '%' : '100.0%';
    const presentPercent = total > 0 ? Math.round(present / total * 100) : 0;
    const latePercent = total > 0 ? Math.round(late / total * 100) : 0;
    const absentPercent = total > 0 ? Math.round(absent / total * 100) : 0;

    return {
      present,
      absent,
      late,
      total,
      rate,
      presentPercent,
      latePercent,
      absentPercent
    };
  }, [attendanceLogs, selectedEmployeeForProfile]);

  // Retrieve distinct roles for dropdown filter
  const uniqueRoles = useMemo(() => {
    const rolesSet = new Set<string>();
    employees.forEach(e => {
      if (e.role) {
        e.role.split(',').forEach(r => {
          const trimmed = r.trim();
          if (trimmed) rolesSet.add(trimmed);
        });
      }
    });
    return ['All Roles', ...Array.from(rolesSet)];
  }, [employees]);

  // Go to direct Employee Profile Reports
  const handleViewEmployeeProfile = (employee: Employee) => {
    setSelectedEmployeeForProfile(employee);
    setCurrentTab('Reports');
    showToast(`Viewing attendance detailed profile for ${employee.name}`);
  };

  return (
    <div className="min-h-screen text-on-surface bg-background">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-[99] flex items-center gap-2 bg-primary text-on-primary px-4 py-3 rounded-lg shadow-lg text-sm transition-all duration-300">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {!isLoggedIn ? (
        /* HIGHEST FIDELITY LOGIN CANVAS SCREEN */
        <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-primary py-12">
          {/* Atmospheric Background Decoration */}
          <div className="fixed inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-[#3fe1fd]/15 rounded-full blur-[120px]"></div>
            <div className="absolute -bottom-[10%] -right-[10%] w-[60%] h-[60%] bg-[#0f4c81]/25 rounded-full blur-[120px]"></div>
          </div>

          <main className="relative z-10 w-full max-w-[440px]">
            <div className="bg-surface-container-lowest rounded-xl p-6 md:p-8 border border-outline-variant custom-shadow transition-transform duration-300 hover:scale-[1.01]">
              
              {/* Header Section */}
              <div className="flex flex-col items-center mb-6">
                <div className="mb-4 animate-bounce flex items-center justify-center bg-white p-2 rounded-xl shadow-sm border border-outline-variant">
                  <img src={logoUrl} alt="Zeex-AI Logo" className="h-16 w-auto object-contain" />
                </div>
                <h1 className="font-bold text-2xl text-primary tracking-tight mb-1 text-center">Z-Hajirii Login</h1>
                <p className="text-sm text-on-surface-variant font-medium text-center">Smart Attendance Management by ZEEXAI</p>
              </div>

              {/* Login Form */}
              <form onSubmit={handleLogin} className="space-y-4">
                {loginError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-error-container/20 border border-error/20">
                    <AlertCircle className="w-5 h-5 text-error shrink-0" />
                    <p className="text-xs text-error font-medium">{loginError}</p>
                  </div>
                )}

                {/* Username Input */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider" htmlFor="username">
                    Username
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-outline">
                      <User className="w-5 h-5 text-on-surface-variant" />
                    </div>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin"
                      className="block w-full pl-10 pr-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface focus:ring-2 focus:ring-primary-container focus:border-primary outline-none transition-all duration-200"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider" htmlFor="password">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => showToast('Demo Password is Zeexai@admin')}
                      className="text-xs font-semibold text-primary hover:underline transition-all"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-outline">
                      <Lock className="w-5 h-5 text-on-surface-variant" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Zeexai@admin"
                      className="block w-full pl-10 pr-12 py-3 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface focus:ring-2 focus:ring-primary-container focus:border-primary outline-none transition-all duration-200"
                    />
                    <button
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-outline hover:text-primary transition-colors"
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me */}
                <div className="flex items-center">
                  <input
                    id="remember"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 text-primary bg-surface-container border-outline-variant rounded focus:ring-primary focus:ring-offset-0"
                  />
                  <label className="ml-2 text-sm text-on-surface-variant cursor-pointer" htmlFor="remember">
                    Remember this device
                  </label>
                </div>

                {/* Demo Credentials Helper */}
                <div className="p-3 bg-surface-container-low rounded-lg border border-outline-variant text-[12px] text-on-surface-filter text-center">
                  <span className="font-bold text-primary">Demo login:</span> <code className="bg-white px-1 py-0.5 rounded shadow-sm">admin</code> / <code className="bg-white px-1 py-0.5 rounded shadow-sm">Zeexai@admin</code>
                  <button
                    type="button"
                    onClick={() => {
                      setUsername('admin');
                      setPassword('Zeexai@admin');
                      showToast('Credentials filled.');
                    }}
                    className="block mx-auto mt-2 text-primary hover:underline font-semibold"
                  >
                    Auto-Fill Credentials
                  </button>
                </div>

                {/* Login Button */}
                <button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary-container active:scale-[0.98] text-on-primary py-3.5 rounded-lg text-sm font-semibold transition-all duration-200 flex justify-center items-center gap-2 shadow-sm"
                >
                  <span>Login</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {/* Footer Info */}
              <div className="mt-6 pt-4 border-t border-outline-variant text-center">
                <p className="text-xs text-on-surface-variant font-medium">
                  © 2024 ZEEXAI Technologies. All rights reserved.
                </p>
              </div>
            </div>

            {/* Help Link */}
            <div className="mt-4 text-center">
              <a
                onClick={() => showToast('Please contact ZEEXAI support for manual registration.')}
                className="inline-flex items-center gap-1 text-xs text-white/80 hover:text-white cursor-pointer transition-colors"
              >
                <HelpCircle className="w-4 h-4" />
                Need assistance with your account?
              </a>
            </div>
          </main>
        </div>
      ) : (
        /* LOGGED IN SYSTEM VIEW */
        <div className="min-h-screen flex flex-col">
          {/* Header */}
          <Header
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
            placeholder={currentTab === 'Users' ? 'Search employees by name, role or ID...' : 'Quick search...'}
          />

          {/* Core Layout Grid */}
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar Desktop */}
            <Sidebar
              currentTab={currentTab}
              onTabChange={(tab) => {
                setCurrentTab(tab);
                setMobileMenuOpen(false);
              }}
              onLogout={handleLogout}
              selectedUserForProfileName={selectedEmployeeForProfile?.name}
            />

            {/* Mobile Nav Sidebar Slide-In */}
            {mobileMenuOpen && (
              <div className="fixed inset-0 z-50 lg:hidden">
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}></div>
                <div className="relative w-64 h-full bg-white flex flex-col p-4 animate-slide-in">
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                      <img src={logoUrl} alt="Zeex-AI Logo" className="h-10 w-auto object-contain bg-white p-1 rounded border border-outline-variant" />
                      <div>
                        <h2 className="text-sm font-bold text-primary">Z-Hajirii</h2>
                        <p className="text-[9px] text-on-surface-variant">Management System</p>
                      </div>
                    </div>
                    <button onClick={() => setMobileMenuOpen(false)} className="p-1 rounded-full hover:bg-surface-container">
                      <X className="w-5 h-5 text-primary" />
                    </button>
                  </div>
                  <nav className="flex-1 space-y-2">
                    {(['Dashboard', 'Attendance', 'Users', 'Reports'] as ViewTab[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => {
                          setCurrentTab(tab);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full px-4 py-3 rounded-lg text-left text-sm font-semibold transition-all ${
                          currentTab === tab
                            ? 'bg-primary text-on-primary font-bold'
                            : 'text-on-surface-variant hover:bg-surface-container-low'
                        }`}
                      >
                        {tab === 'Reports' && selectedEmployeeForProfile
                          ? `${selectedEmployeeForProfile.name}'s Profile`
                          : tab}
                      </button>
                    ))}
                  </nav>
                  <div className="border-t pt-4">
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-3 text-sm font-bold text-error hover:bg-error-container/20 rounded-lg flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Main scrollable view block */}
            <div className="flex-1 lg:ml-64 p-4 sm:p-6 pb-24 sm:pb-28 lg:pb-6 overflow-y-auto max-w-[1400px] mx-auto w-full space-y-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm font-medium text-on-surface-variant">Syncing database records...</p>
                </div>
              ) : (
                <>
                  {/* TAB 1: DASHBOARD / ATTENDANCE LIST & CONTROLS */}
              {currentTab === 'Dashboard' && (
                <>
                  {/* Dashboard Header Title & Description Section */}
                  <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-3xl font-bold text-primary tracking-tight">Attendance Dashboard</h2>
                      <p className="text-sm text-on-surface-variant font-medium">Real-time presence tracking for {todayFullDateString}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                      <div className="flex items-center bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 cursor-pointer hover:bg-surface-container-low transition-all">
                        <span className="mr-2 text-primary font-bold text-xs uppercase tracking-wider">Date:</span>
                        <span className="font-semibold text-sm">{todayDateString}</span>
                      </div>
                      <button
                        onClick={() => showToast('Attendance records archived and saved securely.')}
                        className="bg-primary text-on-primary px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-md"
                      >
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Save Records</span>
                      </button>
                    </div>
                  </section>

                  {/* Summary Bento Grid: Dynamically computed counts based on employee modifications */}
                  <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant custom-shadow flex items-center justify-between">
                      <div>
                        <p className="text-on-surface-variant font-semibold text-xs uppercase tracking-wider mb-1">Total Employees</p>
                        <h3 className="text-primary font-bold text-[32px]">{stats.totalEmployees}</h3>
                      </div>
                      <div className="p-3 bg-primary/10 rounded-full text-primary">
                        <Briefcase className="w-6 h-6" />
                      </div>
                    </div>
                    
                    <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant custom-shadow flex items-center justify-between">
                      <div>
                        <p className="text-on-surface-variant font-semibold text-xs uppercase tracking-wider mb-1">Present</p>
                        <h3 className="text-emerald-700 font-bold text-[32px]">{stats.present}</h3>
                      </div>
                      <div className="p-3 bg-emerald-100 rounded-full text-emerald-700">
                        <Check className="w-6 h-6" strokeWidth={3} />
                      </div>
                    </div>

                    <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant custom-shadow flex items-center justify-between">
                      <div>
                        <p className="text-on-surface-variant font-semibold text-xs uppercase tracking-wider mb-1">Absent</p>
                        <h3 className="text-error font-bold text-[32px]">{stats.absent}</h3>
                      </div>
                      <div className="p-3 bg-error-container rounded-full text-error">
                        <X className="w-6 h-6" strokeWidth={3} />
                      </div>
                    </div>

                    <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant custom-shadow flex items-center justify-between">
                      <div>
                        <p className="text-on-surface-variant font-semibold text-xs uppercase tracking-wider mb-1">Late</p>
                        <h3 className="text-amber-600 font-bold text-[32px]">{stats.late}</h3>
                      </div>
                      <div className="p-3 bg-amber-100 rounded-full text-amber-600">
                        <Clock className="w-6 h-6" />
                      </div>
                    </div>
                  </section>

                  {/* Main Attendance Logging Interactive Table */}
                  <section className="bg-surface-container-lowest rounded-xl border border-outline-variant custom-shadow overflow-hidden">
                    <div className="p-6 border-b border-outline-variant flex justify-between items-center flex-wrap gap-4 bg-white">
                      <h4 className="text-lg font-bold text-primary">Attendance Log</h4>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSearchTerm('');
                            showToast('Search filters cleared');
                          }}
                          className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant px-3 py-1.5 border border-outline-variant rounded-full hover:bg-surface-container"
                        >
                          <Filter className="w-3.5 h-3.5" /> Clear Filters
                        </button>
                        <button
                          onClick={() => showToast('Exporting attendance logs as CSV file...')}
                          className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant px-3 py-1.5 border border-outline-variant rounded-full hover:bg-surface-container"
                        >
                          <Download className="w-3.5 h-3.5" /> Export Logs
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-surface-container-low text-on-surface-variant font-semibold text-xs uppercase tracking-wider">
                            <th className="px-6 py-3.5">Name</th>
                            <th className="px-6 py-3.5">Role</th>
                            <th className="px-6 py-3.5">Email</th>
                            <th className="px-6 py-3.5 text-center">Attendance Status</th>
                            <th className="px-6 py-3.5 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/50">
                          {filteredEmployees.map((emp) => {
                             // Find log for today
                             const log = attendanceLogs.find(l => l.employeeId === emp.id && l.date === todayDateString);
                            const status = log ? log.status : 'Absent'; // default un-logged as Absent
                            
                            return (
                              <tr key={emp.id} className="hover:bg-surface-container-low transition-colors duration-150 group">
                                <td className="px-6 py-4 flex items-center gap-3">
                                  <img
                                    className="w-10 h-10 rounded-full object-cover border border-outline-variant"
                                    src={emp.avatarUrl}
                                    alt={emp.name}
                                  />
                                  <div>
                                    <span className="block font-semibold text-sm text-primary">{emp.name}</span>
                                    <span className="text-[11px] text-on-surface-variant">{emp.empId}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-on-surface-variant font-medium">{emp.role}</td>
                                <td className="px-6 py-4 text-sm text-on-surface-variant font-normal">{emp.email}</td>
                                <td className="px-6 py-4 text-center">
                                  {status === 'Present' && (
                                    <span className="px-4 py-1.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold inline-flex items-center gap-1 select-none">
                                      <Check className="w-3.5 h-3.5 text-emerald-600" /> Present
                                    </span>
                                  )}
                                  {status === 'Absent' && (
                                    <span className="px-4 py-1.5 rounded-full bg-error-container/40 text-error border border-error-container text-xs font-semibold inline-flex items-center gap-1 select-none">
                                      <X className="w-3.5 h-3.5 text-error" /> Absent
                                    </span>
                                  )}
                                  {status === 'Late' && (
                                    <span className="px-4 py-1.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold inline-flex items-center gap-1 select-none">
                                      <Clock className="w-3.5 h-3.5 text-amber-600" /> Late
                                    </span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      title="Mark Present"
                                      onClick={() => handleUpdateStatus(emp.id, 'Present')}
                                      className={`p-1.5 rounded-full border transition-all ${
                                        status === 'Present'
                                          ? 'bg-emerald-600 text-white border-emerald-600'
                                          : 'border-outline-variant text-on-surface-variant hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-700'
                                      }`}
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                      title="Mark Absent"
                                      onClick={() => handleUpdateStatus(emp.id, 'Absent')}
                                      className={`p-1.5 rounded-full border transition-all ${
                                        status === 'Absent'
                                          ? 'bg-error text-white border-error'
                                          : 'border-outline-variant text-on-surface-variant hover:bg-red-50 hover:text-error hover:border-error'
                                      }`}
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                    <button
                                      title="Mark Late"
                                      onClick={() => handleUpdateStatus(emp.id, 'Late')}
                                      className={`p-1.5 rounded-full border transition-all ${
                                        status === 'Late'
                                          ? 'bg-amber-600 text-white border-amber-600'
                                          : 'border-outline-variant text-on-surface-variant hover:bg-amber-50 hover:text-amber-600 hover:border-amber-600'
                                      }`}
                                    >
                                      <Clock className="w-4 h-4" />
                                    </button>

                                    {log && (
                                      <button
                                        title="Delete Attendance"
                                        onClick={() => handleDeleteAttendance(log.id)}
                                        className="p-1.5 rounded-full border border-outline-variant text-error hover:bg-error-container/20 hover:border-error transition-all"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}

                                    <button
                                      title="View Detailed Logs"
                                      onClick={() => handleViewEmployeeProfile(emp)}
                                      className="ml-2 p-1.5 text-xs text-primary font-semibold hover:underline flex items-center gap-1 hover:text-primary-container"
                                    >
                                      <ExternalLink className="w-3 h-3" /> Profile
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="p-6 bg-surface-container-low border-t border-outline-variant flex justify-between items-center">
                      <p className="text-sm font-semibold text-on-surface-variant">Showing {filteredEmployees.length} of {employees.length} employees</p>
                      <div className="flex gap-2">
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant opacity-50 cursor-not-allowed">
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary text-on-primary font-semibold text-sm">1</button>
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container">2</button>
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {/* TAB 2: ATTENDANCE LOG LOGICAL GRID VIEW */}
              {currentTab === 'Attendance' && (
                <>
                  <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-3xl font-bold text-primary tracking-tight">Active Attendance Dashboard</h2>
                      <p className="text-sm text-on-surface-variant font-medium">Configure daily shifts, watch clock-ins, and override permissions.</p>
                    </div>
                    <button
                      onClick={() => {
                        // Mark all employees present as quick-run tool
                        employees.forEach(emp => {
                          handleUpdateStatus(emp.id, 'Present', selectedAttendanceDate);
                        });
                        showToast(`All users marked Present for ${selectedAttendanceDate}.`);
                      }}
                      className="bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-emerald-700 active:scale-95 transition-all shadow-md"
                    >
                      <Check className="w-4 h-4" />
                      <span>Auto-Checkin All</span>
                    </button>
                  </section>

                  {/* Attendance Filter Bar */}
                  <div className="bg-surface-container-lowest rounded-xl p-4 custom-shadow flex flex-wrap gap-4 items-center border border-outline-variant/30">
                    <div className="flex-1 min-w-[240px] relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-background border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary-container focus:border-primary outline-none text-sm transition-all"
                        placeholder="Search by name, role or ID..."
                      />
                    </div>
                    
                    <div className="flex items-center gap-2 relative">
                      <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Date:</span>
                      <button
                        type="button"
                        onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                        className="bg-background border border-outline-variant rounded-lg px-4 py-2 text-sm font-semibold hover:bg-surface-container-low transition-colors flex items-center gap-2 cursor-pointer shadow-sm min-w-[130px]"
                      >
                        <Calendar className="w-4 h-4 text-primary" />
                        <span>{selectedAttendanceDate}</span>
                      </button>

                      {isCalendarOpen && (
                        <>
                          <div 
                            className="fixed inset-0 z-40 bg-transparent"
                            onClick={() => setIsCalendarOpen(false)}
                          />

                          <div className="absolute top-full right-0 mt-2 z-50 bg-white rounded-xl border border-outline-variant p-4 shadow-xl w-[320px] animate-bounce-short text-on-surface">
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setCalendarViewDate(new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1));
                                }}
                                className="p-1 hover:bg-surface-container rounded-full text-on-surface-variant cursor-pointer active:scale-95 transition-transform"
                              >
                                <ChevronLeft className="w-5 h-5" />
                              </button>

                              <div className="flex items-center gap-1">
                                <select
                                  value={calendarViewDate.getMonth()}
                                  onChange={(e) => {
                                    setCalendarViewDate(new Date(calendarViewDate.getFullYear(), parseInt(e.target.value, 10), 1));
                                  }}
                                  className="bg-surface-container border border-outline-variant rounded px-2 py-1 text-xs font-bold focus:outline-none cursor-pointer"
                                >
                                  {MONTHS.map((m, idx) => (
                                    <option key={m} value={idx}>{m}</option>
                                  ))}
                                </select>

                                <select
                                  value={calendarViewDate.getFullYear()}
                                  onChange={(e) => {
                                    setCalendarViewDate(new Date(parseInt(e.target.value, 10), calendarViewDate.getMonth(), 1));
                                  }}
                                  className="bg-surface-container border border-outline-variant rounded px-2 py-1 text-xs font-bold focus:outline-none cursor-pointer"
                                >
                                  {Array.from({ length: 21 }, (_, i) => 2020 + i).map((y) => (
                                    <option key={y} value={y}>{y}</option>
                                  ))}
                                </select>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setCalendarViewDate(new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1));
                                }}
                                className="p-1 hover:bg-surface-container rounded-full text-on-surface-variant cursor-pointer active:scale-95 transition-transform"
                              >
                                <ChevronRight className="w-5 h-5" />
                              </button>
                            </div>

                            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                              <div>Su</div>
                              <div>Mo</div>
                              <div>Tu</div>
                              <div>We</div>
                              <div>Th</div>
                              <div>Fr</div>
                              <div>Sa</div>
                            </div>

                            <div className="grid grid-cols-7 gap-1 text-center">
                              {calendarDays.map((cell, cellIdx) => {
                                const cellDateObj = new Date(cell.year, cell.month, cell.day);
                                const formattedCellDate = formatDateString(cellDateObj);
                                const isSelected = formattedCellDate === selectedAttendanceDate;
                                const isToday = formatDateString(new Date()) === formattedCellDate;

                                return (
                                  <button
                                    key={cellIdx}
                                    type="button"
                                    onClick={() => {
                                      setSelectedAttendanceDate(formattedCellDate);
                                      setIsCalendarOpen(false);
                                    }}
                                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold active:scale-90 transition-all cursor-pointer select-none ${
                                      isSelected
                                        ? 'bg-primary text-on-primary font-bold shadow-md shadow-primary/20'
                                        : !cell.isCurrentMonth
                                        ? 'text-outline/40 hover:bg-surface-container-low'
                                        : isToday
                                        ? 'border-2 border-primary text-primary font-bold hover:bg-primary/5'
                                        : 'text-on-surface hover:bg-surface-container'
                                    }`}
                                  >
                                    {cell.day}
                                  </button>
                                );
                              })}
                            </div>

                            <div className="mt-3 pt-2 border-t flex justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  const todayFormatted = formatDateString(new Date());
                                  setSelectedAttendanceDate(todayFormatted);
                                  setIsCalendarOpen(false);
                                }}
                                className="px-3 py-1 bg-primary/10 text-primary hover:bg-primary/20 text-[11px] font-bold rounded-lg cursor-pointer transition-colors"
                              >
                                Jump to Today
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Status:</span>
                      <select
                        value={attendanceStatusFilter}
                        onChange={(e) => setAttendanceStatusFilter(e.target.value)}
                        className="bg-background border border-outline-variant rounded-lg px-4 py-2 text-sm font-semibold focus:ring-primary-container outline-none"
                      >
                        <option value="All Statuses">All Statuses</option>
                        <option value="Present">Present</option>
                        <option value="Late">Late</option>
                        <option value="Absent">Absent</option>
                      </select>
                    </div>

                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setSelectedAttendanceDate(todayDateString);
                        setAttendanceStatusFilter('All Statuses');
                        showToast('Attendance filters reset.');
                      }}
                      className="flex items-center gap-2 px-4 py-2 border border-outline-variant rounded-lg hover:bg-surface-container-low transition-colors font-medium text-sm"
                    >
                      <Filter className="w-4 h-4 text-on-surface-variant" />
                      <span>Reset</span>
                    </button>
                  </div>

                  {/* Interactive Status Log Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredAttendanceEmployees.map((emp) => {
                      const log = attendanceLogs.find(l => l.employeeId === emp.id && l.date === selectedAttendanceDate);
                      const status = log ? log.status : 'Absent';

                      return (
                        <div key={emp.id} className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant custom-shadow flex flex-col justify-between space-y-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <img src={emp.avatarUrl} alt={emp.name} className="w-12 h-12 rounded-full object-cover" />
                              <div>
                                <h4 className="font-bold text-primary">{emp.name}</h4>
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {emp.role.split(',').map(r => (
                                    <span key={r} className="text-[10px] font-semibold bg-surface-container text-on-surface-variant px-1.5 py-0.5 rounded">
                                      {r.trim()}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                                status === 'Present' ? 'bg-emerald-100 text-emerald-800' :
                                status === 'Late' ? 'bg-amber-100 text-amber-800' :
                                'bg-error-container/40 text-error'
                              }`}>
                                {status}
                              </span>
                              {log && (
                                <button
                                  title="Delete Attendance Log"
                                  onClick={() => handleDeleteAttendance(log.id)}
                                  className="p-1 text-error hover:bg-error-container/20 rounded-md transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 bg-surface-container-low p-3 rounded-lg text-xs">
                            <div>
                              <span className="text-on-surface-variant block uppercase tracking-wider text-[9px] font-bold">Clock In:</span>
                              <span className="font-bold text-primary">{log?.clockIn || '--:--'}</span>
                            </div>
                            <div>
                              <span className="text-on-surface-variant block uppercase tracking-wider text-[9px] font-bold">Clock Out:</span>
                              {log && (status === 'Present' || status === 'Late') && (log.clockOut === '--:--' || !log.clockOut) ? (
                                <button
                                  onClick={() => handleClockOut(emp.id, selectedAttendanceDate)}
                                  className="mt-1 px-2.5 py-1 bg-primary text-on-primary font-bold text-[10px] rounded-md hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-sm"
                                >
                                  Clock Out
                                </button>
                              ) : (
                                <span className="font-bold text-primary">{log?.clockOut || '--:--'}</span>
                              )}
                            </div>
                          </div>

                          <div className="flex justify-between items-center gap-2 pt-2 border-t">
                            <span className="text-[11px] font-bold text-on-surface-variant">Update Status:</span>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => handleUpdateStatus(emp.id, 'Present', selectedAttendanceDate)}
                                className="px-2.5 py-1 bg-emerald-600 text-white text-[11px] font-bold rounded-lg hover:brightness-110"
                              >
                                Present
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(emp.id, 'Late', selectedAttendanceDate)}
                                className="px-2.5 py-1 bg-amber-600 text-white text-[11px] font-bold rounded-lg hover:brightness-110"
                              >
                                Late
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(emp.id, 'Absent', selectedAttendanceDate)}
                                className="px-2.5 py-1 bg-error text-white text-[11px] font-bold rounded-lg hover:brightness-110"
                              >
                                Absent
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* TAB 3: USER MANAGEMENT VIEW CHIPS & ADD ACTIONS */}
              {currentTab === 'Users' && (
                <>
                  <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-3xl font-bold text-primary tracking-tight">User Management</h2>
                      <p className="text-sm text-on-surface-variant font-medium">Configure and monitor system access for {employees.length} active employees.</p>
                    </div>
                    <button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="bg-primary text-on-primary px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-md"
                    >
                      <UserPlus className="w-5 h-5" />
                      <span>Create New User</span>
                    </button>
                  </section>

                  {/* Filter & Search Bar */}
                  <div className="bg-surface-container-lowest rounded-xl p-4 custom-shadow flex flex-wrap gap-4 items-center border border-outline-variant/30">
                    <div className="flex-1 min-w-[280px] relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-background border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary-container focus:border-primary outline-none text-sm transition-all"
                        placeholder="Search by name, email or ID..."
                      />
                    </div>
                    
                    <div className="flex gap-2 w-full md:w-auto justify-between md:justify-end">
                      <select
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        className="bg-background border border-outline-variant rounded-lg px-4 py-2 text-sm font-semibold focus:ring-primary-container outline-none"
                      >
                        {uniqueRoles.map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                      
                      <button
                        onClick={() => {
                          setSearchTerm('');
                          setRoleFilter('All Roles');
                          showToast('Filters reset to default.');
                        }}
                        className="flex items-center gap-2 px-4 py-2 border border-outline-variant rounded-lg hover:bg-surface-container-low transition-colors font-medium text-sm"
                      >
                        <Filter className="w-4 h-4 text-on-surface-variant" />
                        <span>Reset</span>
                      </button>
                    </div>
                  </div>

                  {/* Grid Cards of Users with full actions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12">
                    {filteredEmployees.map((emp) => (
                      <div
                        key={emp.id}
                        className="bg-surface-container-lowest rounded-xl p-6 custom-shadow border border-outline-variant/20 hover:border-primary/30 transition-all group relative overflow-hidden"
                      >
                        {/* Quick Hover Delete / Edit Controls */}
                        <div className="absolute top-2 right-2 p-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <button
                            title="Edit User Info"
                            onClick={() => {
                              setSelectedEmployeeForProfile(emp);
                              showToast(`Loaded ${emp.name} to edit/profile tab.`);
                              setCurrentTab('Reports');
                            }}
                            className="p-2 bg-surface-container-high rounded-lg text-primary hover:bg-primary hover:text-on-primary transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            title="Remove User"
                            onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                            className="p-2 bg-error-container rounded-lg text-error hover:bg-error hover:text-on-error transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex flex-col items-center text-center">
                          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary-container p-1 mb-4">
                            <img src={emp.avatarUrl} alt={emp.name} className="w-full h-full object-cover rounded-full" />
                          </div>
                          
                          <h3 className="font-bold text-lg text-on-surface mb-1">{emp.name}</h3>
                          
                          <div className="flex flex-wrap gap-1.5 justify-center mb-3">
                            {emp.role.split(',').map((r) => (
                              <span key={r} className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                                {r.trim()}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center gap-2 text-on-surface-variant text-xs truncate w-full justify-center">
                            <span className="text-on-surface-variant">✉</span>
                            <span className="truncate">{emp.email}</span>
                          </div>

                          <div className="mt-2 text-[11px] text-on-surface-variant font-mono">
                            ID: {emp.empId}
                          </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-outline-variant-low flex justify-between items-center">
                          <button
                            onClick={() => handleViewEmployeeProfile(emp)}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            View Analytics
                          </button>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                            <span className="text-xs text-on-surface-variant">Active Now</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* TAB 4: DETAILED PROFILE REPORT AND PERSONAL TRENDS */}
              {currentTab === 'Reports' && selectedEmployeeForProfile && (
                <>
                  {/* Detailed User Profile Header */}
                  <section className="bg-surface-container-lowest custom-shadow rounded-xl p-8 flex flex-col md:flex-row items-center gap-6">
                    <div className="relative">
                      <div className="h-32 w-32 rounded-full ring-4 ring-primary/10 overflow-hidden">
                        <img
                          src={selectedEmployeeForProfile.avatarUrl}
                          alt={selectedEmployeeForProfile.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <input
                        type="file"
                        id="profile-avatar-upload"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file && selectedEmployeeForProfile) {
                            const reader = new FileReader();
                            reader.onloadend = async () => {
                              const base64Url = reader.result as string;
                              try {
                                const { error } = await supabase
                                  .from('employees')
                                  .update({ avatar_url: base64Url })
                                  .eq('id', selectedEmployeeForProfile.id);
                                if (error) throw error;
                                
                                setSelectedEmployeeForProfile(prev => prev ? { ...prev, avatarUrl: base64Url } : null);
                                showToast('Profile image uploaded successfully.');
                                await fetchData();
                              } catch (err) {
                                console.error(err);
                                showToast('Failed to upload profile image.');
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <button
                        onClick={async () => {
                          if (!selectedEmployeeForProfile) return;
                          const choice = window.confirm("Click 'OK' to upload a photo from your device, or 'Cancel' to enter an image URL instead.");
                          if (choice) {
                            document.getElementById('profile-avatar-upload')?.click();
                          } else {
                            const newUrl = prompt('Enter image URL for avatar:', selectedEmployeeForProfile.avatarUrl);
                            if (newUrl) {
                              try {
                                const { error } = await supabase
                                  .from('employees')
                                  .update({ avatar_url: newUrl })
                                  .eq('id', selectedEmployeeForProfile.id);
                                if (error) throw error;
                                
                                setSelectedEmployeeForProfile(prev => prev ? { ...prev, avatarUrl: newUrl } : null);
                                showToast('Profile image updated successfully.');
                                await fetchData();
                              } catch (err) {
                                console.error(err);
                                showToast('Failed to update profile image in database.');
                              }
                            }
                          }
                        }}
                        className="absolute bottom-0 right-0 bg-primary text-on-primary rounded-full p-2 shadow-lg active:scale-95 transition-transform cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-center md:text-left space-y-1">
                      <h2 className="text-3xl font-bold text-primary tracking-tight">{selectedEmployeeForProfile.name}</h2>
                      <p className="text-lg text-secondary font-semibold">{selectedEmployeeForProfile.role}</p>
                      <div className="flex flex-wrap justify-center md:justify-start gap-4 mt-2">
                        <span className="flex items-center gap-1 text-sm text-on-surface-variant">
                          <span>✉</span>
                          <span>{selectedEmployeeForProfile.email}</span>
                        </span>
                        <span className="flex items-center gap-1 text-sm text-on-surface-variant">
                          <span>ID:</span>
                          <span>{selectedEmployeeForProfile.empId}</span>
                        </span>
                      </div>
                    </div>

                    <div className="md:ml-auto flex gap-3 flex-wrap">
                      <button
                        onClick={() => showToast(`Successfully exported PDF profile file to disk for ${selectedEmployeeForProfile.name}.`)}
                        className="px-6 py-2 border border-primary text-primary font-semibold text-sm rounded-lg hover:bg-primary/5 transition-colors"
                      >
                        Export Profile
                      </button>
                      <button
                        onClick={() => showToast(`Generated comprehensive monthly report for ${selectedEmployeeForProfile.name}.`)}
                        className="px-6 py-2 bg-primary text-on-primary font-semibold text-sm rounded-lg hover:brightness-110 transition-all"
                      >
                        Generate Report
                      </button>
                    </div>
                  </section>

                  {/* Summary Bento Stats */}
                  <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-surface-container-lowest custom-shadow rounded-xl p-6 flex items-center gap-4">
                      <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                        <Check className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Present Days</p>
                        <p className="text-2xl font-bold">{profileStats.present}</p>
                      </div>
                    </div>

                    <div className="bg-surface-container-lowest custom-shadow rounded-xl p-6 flex items-center gap-4">
                      <div className="p-3 bg-red-50 text-error rounded-lg">
                        <X className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Absent Days</p>
                        <p className="text-2xl font-bold">{profileStats.absent}</p>
                      </div>
                    </div>

                    <div className="bg-surface-container-lowest custom-shadow rounded-xl p-6 flex items-center gap-4">
                      <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
                        <Clock className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Late Days</p>
                        <p className="text-2xl font-bold">{profileStats.late}</p>
                      </div>
                    </div>

                    <div className="bg-surface-container-lowest custom-shadow rounded-xl p-6 flex items-center gap-4 border-l-4 border-primary">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Attendance Rate</p>
                        <p className="text-2xl font-bold text-primary">{profileStats.rate}</p>
                      </div>
                      <div className="relative h-12 w-12 shrink-0">
                        <svg className="h-full w-full" viewBox="0 0 36 36">
                          <path
                            className="text-surface-container-high stroke-current"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            strokeWidth="3.5"
                          ></path>
                          <path
                            className="text-primary stroke-current"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            fill="none"
                            strokeDasharray={`${parseFloat(profileStats.rate)}, 100`}
                            strokeLinecap="round"
                            strokeWidth="3.5"
                          ></path>
                        </svg>
                      </div>
                    </div>
                  </section>

                  {/* Trends & Distribution charts */}
                  <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Distribution circle */}
                    <div className="bg-surface-container-lowest custom-shadow rounded-xl p-6 lg:col-span-1">
                      <h3 className="font-bold text-lg text-on-surface mb-6">Status Distribution</h3>
                      <div className="relative h-64 flex items-center justify-center">
                        <div className="relative h-48 w-48 rounded-full border-[20px] border-emerald-500 flex items-center justify-center flex-col">
                          <span className="font-bold text-2xl text-primary">{profileStats.total}</span>
                          <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Total Days</span>
                        </div>
                      </div>
                      <div className="space-y-2 mt-4 text-sm font-semibold">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2"><span className="w-3 h-3 bg-emerald-500 rounded-full"></span> Present</span>
                          <span>{profileStats.presentPercent}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2"><span className="w-3 h-3 bg-amber-500 rounded-full"></span> Late</span>
                          <span>{profileStats.latePercent}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2"><span className="w-3 h-3 bg-red-500 rounded-full"></span> Absent</span>
                          <span>{profileStats.absentPercent}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Monthly Trends chart */}
                    <div className="bg-surface-container-lowest custom-shadow rounded-xl p-6 lg:col-span-2">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="font-bold text-lg text-on-surface">Monthly Attendance Trend</h3>
                        <div className="flex gap-1.5 bg-surface-container-low p-1 rounded-lg text-xs">
                          <button className="px-2 py-1 rounded hover:bg-white font-semibold">Jan-Jul</button>
                          <button className="px-2 py-1 rounded bg-white font-semibold shadow-sm text-primary">Aug-Dec</button>
                        </div>
                      </div>
                      
                      {/* Simulating custom vector bars */}
                      <div className="h-64 relative flex items-end justify-between gap-4 px-4 pt-8">
                        <div className="flex-1 bg-primary/10 rounded-t-lg transition-all hover:bg-primary/30" style={{ height: '85%' }}></div>
                        <div className="flex-1 bg-primary/10 rounded-t-lg transition-all hover:bg-primary/30" style={{ height: '92%' }}></div>
                        <div className="flex-1 bg-primary/10 rounded-t-lg transition-all hover:bg-primary/30" style={{ height: '78%' }}></div>
                        <div className="flex-1 bg-primary/10 rounded-t-lg transition-all hover:bg-primary/30" style={{ height: '95%' }}></div>
                        <div className="flex-1 bg-primary/10 rounded-t-lg transition-all hover:bg-primary/30" style={{ height: '88%' }}></div>
                        <div className="relative flex-1 bg-primary rounded-t-lg transition-all hover:brightness-110" style={{ height: '98%' }}>
                          <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-primary text-on-primary text-[10px] font-bold px-1.5 py-0.5 rounded">98%</span>
                        </div>
                        <div className="flex-1 bg-primary/10 rounded-t-lg transition-all hover:bg-primary/30" style={{ height: '90%' }}></div>
                      </div>

                      <div className="flex justify-between px-4 mt-4 text-xs font-semibold text-on-surface-variant">
                        <span>Jan</span>
                        <span>Feb</span>
                        <span>Mar</span>
                        <span>Apr</span>
                        <span>May</span>
                        <span className="text-primary font-bold">Jun</span>
                        <span>Jul</span>
                      </div>
                    </div>
                  </section>

                  {/* Individual Logs History Table */}
                  <section className="bg-surface-container-lowest custom-shadow rounded-xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-outline-variant bg-white">
                      <h3 className="font-bold text-lg text-primary">Personal History Logs</h3>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-surface-container-low text-on-surface-variant text-xs font-semibold uppercase tracking-wider">
                            <th className="px-6 py-3">Date</th>
                            <th className="px-6 py-3">Clock In</th>
                            <th className="px-6 py-3">Clock Out</th>
                            <th className="px-6 py-3">Total Working Hours</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/30">
                          {attendanceLogs
                            .filter(log => log.employeeId === selectedEmployeeForProfile.id)
                            .map((log) => (
                              <tr key={log.id} className="hover:bg-primary/5 transition-colors">
                                <td className="px-6 py-4 font-semibold text-sm">{log.date}</td>
                                <td className="px-6 py-4 text-sm text-on-surface-variant">{log.clockIn}</td>
                                <td className="px-6 py-4 text-sm text-on-surface-variant">
                                  {selectedEmployeeForProfile && log.date === todayDateString && (log.status === 'Present' || log.status === 'Late') && (log.clockOut === '--:--' || !log.clockOut) ? (
                                    <button
                                      onClick={() => handleClockOut(selectedEmployeeForProfile.id)}
                                      className="px-2 py-0.5 bg-primary text-on-primary font-bold text-[10px] rounded hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-sm"
                                    >
                                      Clock Out
                                    </button>
                                  ) : (
                                    log.clockOut
                                  )}
                                </td>
                                <td className="px-6 py-4 font-semibold text-sm text-primary">{log.totalHours}</td>
                                <td className="px-6 py-4">
                                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                    log.status === 'Present' ? 'bg-emerald-100 text-emerald-800' :
                                    log.status === 'Late' ? 'bg-amber-100 text-amber-800' :
                                    'bg-error-container/40 text-error'
                                  }`}>
                                    {log.status}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <button
                                    title="Delete Attendance Log"
                                    onClick={() => handleDeleteAttendance(log.id)}
                                    className="p-1.5 rounded-full border border-outline-variant text-error hover:bg-error-container/20 hover:border-error transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="p-4 bg-surface-container-low border-t text-center">
                      <button onClick={() => showToast('All logs fully loaded.')} className="font-bold text-sm text-primary hover:underline">
                        View More Months
                      </button>
                    </div>
                  </section>
                </>
              )}

              {/* Empty profile fallback when no employee is selected/available */}
              {currentTab === 'Reports' && !selectedEmployeeForProfile && (
                <div className="bg-surface-container-lowest custom-shadow rounded-xl p-12 text-center text-on-surface-variant font-medium">
                  <User className="w-16 h-16 text-outline mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-primary mb-2">No Profile Selected</h3>
                  <p className="text-sm max-w-md mx-auto">
                    Please select an employee from the Dashboard or Users tab to view their detailed reports and history.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
          </div>

          {/* Bottom Mobile Tab Navigation */}
          <nav className="fixed bottom-0 left-0 w-full flex justify-around items-center py-2.5 bg-surface-container-lowest/95 backdrop-blur-md border-t border-outline-variant shadow-lg lg:hidden z-50">
            {(['Dashboard', 'Attendance', 'Users', 'Reports'] as ViewTab[]).map((tab) =>  (
              <button
                key={tab}
                onClick={() => {
                  setCurrentTab(tab);
                }}
                className={`flex flex-col items-center justify-center text-[10px] transition-transform ${
                  currentTab === tab ? 'text-primary font-bold' : 'text-on-surface-variant'
                }`}
              >
                <span className="text-xl mb-0.5">
                  {tab === 'Dashboard' && '📊'}
                  {tab === 'Attendance' && '📋'}
                  {tab === 'Users' && '👥'}
                  {tab === 'Reports' && '👤'}
                </span>
                <span>{tab}</span>
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* CREATE NEW EMPLOYEE MODAL DIALOG */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsCreateModalOpen(false)}></div>
          
          <div className="relative bg-white rounded-xl w-full max-w-lg overflow-hidden custom-shadow border border-outline-variant/50 animate-bounce-short">
            <div className="bg-primary p-4 text-on-primary flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                Add New Corporate User
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="rounded-full hover:bg-white/20 p-1 text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="p-6 space-y-4 max-h-[calc(100vh-160px)] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Adrian Sterling"
                  value={newEmpName}
                  onChange={(e) => setNewEmpName(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Employee ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. EMP-2024-001"
                    value={newEmpId}
                    onChange={(e) => setNewEmpId(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. adrian@zhajirii.com"
                    value={newEmpEmail}
                    onChange={(e) => setNewEmpEmail(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                  Select Job Roles *
                </label>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-3 bg-surface-container-low border border-outline-variant rounded-lg">
                  {AVAILABLE_ROLES.map((role) => {
                    const isSelected = selectedRoles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            if (selectedRoles.length > 1) {
                              setSelectedRoles(selectedRoles.filter(r => r !== role));
                            } else {
                              showToast('At least one role must be selected.');
                            }
                          } else {
                            setSelectedRoles([...selectedRoles, role]);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border cursor-pointer select-none ${
                          isSelected
                            ? 'bg-primary text-on-primary border-primary'
                            : 'bg-white text-on-surface-variant border-outline-variant hover:bg-surface-container'
                        }`}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                  Avatar Photo
                </label>
                <div className="flex flex-col sm:flex-row items-center gap-4 bg-surface-container-low border border-outline-variant rounded-lg p-4">
                  {newEmpAvatar ? (
                    <div className="relative group w-16 h-16 rounded-full overflow-hidden border border-outline-variant shrink-0">
                      <img src={newEmpAvatar} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setNewEmpAvatar('')}
                        className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-surface-container-high border border-dashed border-outline flex items-center justify-center shrink-0">
                      <span className="text-on-surface-variant text-xl">👤</span>
                    </div>
                  )}
                  <div className="flex-1 w-full space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setNewEmpAvatar(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="block w-full text-xs text-on-surface-variant
                        file:mr-4 file:py-1.5 file:px-4
                        file:rounded-lg file:border-0
                        file:text-xs file:font-semibold
                        file:bg-primary file:text-on-primary
                        hover:file:brightness-110
                        cursor-pointer"
                    />
                    <div className="text-center text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">or</div>
                    <input
                      type="url"
                      placeholder="Enter image URL instead"
                      value={newEmpAvatar.startsWith('data:') ? '' : newEmpAvatar}
                      onChange={(e) => setNewEmpAvatar(e.target.value)}
                      className="w-full bg-background border border-outline-variant rounded-lg p-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-outline-variant rounded-lg text-sm font-semibold hover:bg-surface-container-low"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary text-on-primary rounded-lg text-sm font-semibold hover:brightness-110 shadow-md"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
