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

// Helper to extract break minutes from serialized total hours
const getBreakMinutes = (totalHoursStr: string): number => {
  if (!totalHoursStr) return 0;
  const parts = totalHoursStr.split('|');
  if (parts.length < 2) return 0;
  const breakMins = parseInt(parts[1], 10);
  return isNaN(breakMins) ? 0 : breakMins;
};

// Helper to calculate productive hours (total duration minus break)
const getProductiveHoursStr = (totalHoursStr: string): string => {
  if (!totalHoursStr || totalHoursStr === '--:--') return '0h 00m';
  const rawHoursStr = totalHoursStr.split('|')[0];
  const breakMins = getBreakMinutes(totalHoursStr);
  if (breakMins === 0) return rawHoursStr;

  try {
    const parts = rawHoursStr.match(/(\d+)h\s*(\d+)m/i);
    if (!parts) return rawHoursStr;
    const hours = parseInt(parts[1], 10);
    const minutes = parseInt(parts[2], 10);
    const totalMins = hours * 60 + minutes;
    const productiveMins = Math.max(0, totalMins - breakMins);
    const prodHours = Math.floor(productiveMins / 60);
    const prodMins = productiveMins % 60;
    return `${prodHours}h ${prodMins.toString().padStart(2, '0')}m`;
  } catch (err) {
    console.error(err);
    return rawHoursStr;
  }
};

// Parse formatted total hours to decimal hours (taking break minutes into account)
const parseTotalHoursToDecimal = (totalHoursStr: string): number => {
  if (!totalHoursStr || totalHoursStr === '0h 00m' || totalHoursStr === '--:--') return 0;
  try {
    const rawHoursStr = totalHoursStr.split('|')[0];
    const breakMins = getBreakMinutes(totalHoursStr);
    const parts = rawHoursStr.match(/(\d+)h\s*(\d+)m/i);
    if (!parts) return 0;
    const hours = parseInt(parts[1], 10);
    const minutes = parseInt(parts[2], 10);
    const totalMins = hours * 60 + minutes;
    const productiveMins = Math.max(0, totalMins - breakMins);
    return productiveMins / 60;
  } catch (err) {
    console.error(err);
    return 0;
  }
};

// Convert "hh:mm AM/PM" to "HH:mm" (24-hour)
const time12To24 = (time12: string): string => {
  if (!time12 || time12 === '--:--') return '';
  const parts = time12.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!parts) return '';
  let hours = parseInt(parts[1], 10);
  const minutes = parts[2];
  const modifier = parts[3].toUpperCase();
  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${minutes}`;
};

// Convert "HH:mm" (24-hour) to "hh:mm AM/PM"
const time24To12 = (time24: string): string => {
  if (!time24) return '--:--';
  const parts = time24.split(':');
  if (parts.length < 2) return '--:--';
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const modifier = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  return `${String(hours).padStart(2, '0')}:${minutes} ${modifier}`;
};

// Calculate minutes late if clock in time exceeds 12:00 PM (noon)
const calculateMinutesLate = (clockInStr: string): number => {
  if (!clockInStr || clockInStr === '--:--') return 0;
  const parts = clockInStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!parts) return 0;
  let hours = parseInt(parts[1], 10);
  const minutes = parseInt(parts[2], 10);
  const modifier = parts[3].toUpperCase();
  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  
  const totalMins = hours * 60 + minutes;
  const targetMins = 12 * 60; // 12:00 PM is 720 minutes
  
  if (totalMins > targetMins) {
    return totalMins - targetMins;
  }
  return 0;
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
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false); // Ask login credential first
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(true);

  // Core Management State
  const [currentTab, setCurrentTab] = useState<ViewTab>('Dashboard');
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>(INITIAL_ATTENDANCE_LOGS);
  const [selectedEmployeeForProfile, setSelectedEmployeeForProfile] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Attendance Log Edit State
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editClockIn, setEditClockIn] = useState<string>('');
  const [editClockOut, setEditClockOut] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'Present' | 'Absent' | 'Late'>('Present');

  // Chart Metric Toggle State ('status' | 'hours')
  const [chartMetric, setChartMetric] = useState<'status' | 'hours'>('status');

  // Global Search / Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [trendFilter, setTrendFilter] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [roleFilter, setRoleFilter] = useState<string>('All Roles');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Attendance Tab Filters
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState<string>(todayDateString);
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState<string>('All Statuses');

  // Dashboard Date State
  const [dashboardDate, setDashboardDate] = useState<string>(todayDateString);
  const dashboardFullDateString = useMemo(() => {
    const parsed = parseDateString(dashboardDate);
    return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }, [dashboardDate]);

  // Unique Dates for Attendance filter dropdown
  const uniqueAttendanceDates = useMemo(() => {
    const datesSet = new Set<string>(attendanceLogs.map(l => l.date));
    datesSet.add(todayDateString); // always include today
    return (Array.from(datesSet) as string[]).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [attendanceLogs, todayDateString]);

  // Helper to get dates for the current week (Monday to Sunday)
  const currentWeekDates = useMemo(() => {
    const current = new Date();
    const currentDay = current.getDay();
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    
    const monday = new Date(current);
    monday.setDate(current.getDate() + distanceToMonday);
    
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d);
    }
    return dates;
  }, []);

  // Weekly attendance data calculated from live logs of the SELECTED employee
  const weeklyData = useMemo(() => {
    const today = new Date();
    if (!selectedEmployeeForProfile) return [];

    return currentWeekDates.map((dateObj, index) => {
      const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const isFuture = dateObj.getTime() > new Date().setHours(23, 59, 59, 999);
      
      const isToday = dateObj.getDate() === today.getDate() &&
                      dateObj.getMonth() === today.getMonth() &&
                      dateObj.getFullYear() === today.getFullYear();

      if (isFuture) {
        return {
          label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index],
          present: 0,
          late: 0,
          absent: 0,
          presentPercent: 0,
          latePercent: 0,
          absentPercent: 0,
          isToday: false,
          isWeekend: false,
          total: 0,
          avgWorkingHours: 0
        };
      }

      // Check if this date is strictly before the employee's creation date (at day level)
      if (selectedEmployeeForProfile.createdAt) {
        const createdDate = new Date(selectedEmployeeForProfile.createdAt);
        const dateMidnight = new Date(dateObj);
        dateMidnight.setHours(0, 0, 0, 0);
        const createdMidnight = new Date(createdDate);
        createdMidnight.setHours(0, 0, 0, 0);
        
        if (dateMidnight.getTime() < createdMidnight.getTime()) {
          return {
            label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index],
            present: 0,
            late: 0,
            absent: 0,
            presentPercent: 0,
            latePercent: 0,
            absentPercent: 0,
            isToday: false,
            isWeekend: false,
            total: 0,
            avgWorkingHours: 0
          };
        }
      }

      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
      
      // Find log for the selected employee on this date
      const log = attendanceLogs.find(l => l.employeeId === selectedEmployeeForProfile.id && l.date === dateStr);
      
      // If weekend and no log recorded, don't count absent
      if (isWeekend && !log) {
        return {
          label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index],
          present: 0,
          late: 0,
          absent: 0,
          presentPercent: 0,
          latePercent: 0,
          absentPercent: 0,
          isToday,
          isWeekend: true,
          total: 0,
          avgWorkingHours: 0
        };
      }

      let present = 0;
      let late = 0;
      let absent = 0;
      let hours = 0;
      let minsLate = 0;

      if (log) {
        if (log.status === 'Present') present = 1;
        else if (log.status === 'Late') late = 1;
        else if (log.status === 'Absent') absent = 1;
        hours = parseTotalHoursToDecimal(log.totalHours);
        minsLate = calculateMinutesLate(log.clockIn);
      } else {
        const dayOfWeek = dateObj.getDay();
        const isPastDay = dateObj.getTime() < new Date().setHours(0, 0, 0, 0);
        const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6;

        if (isPastDay && isWeekday) {
          absent = 1;
        } else {
          return {
            label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index],
            present: 0,
            late: 0,
            absent: 0,
            presentPercent: 0,
            latePercent: 0,
            absentPercent: 0,
            isToday,
            isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
            total: 0,
            avgWorkingHours: 0,
            minsLate: 0
          };
        }
      }

      const total = present + late + absent;
      const presentPercent = total > 0 ? (present / total) * 100 : 0;
      const latePercent = total > 0 ? (late / total) * 100 : 0;
      const absentPercent = total > 0 ? (absent / total) * 100 : 0;

      return {
        label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index],
        present,
        late,
        absent,
        presentPercent,
        latePercent,
        absentPercent,
        isToday,
        isWeekend: false,
        total,
        avgWorkingHours: hours,
        minsLate
      };
    });
  }, [currentWeekDates, selectedEmployeeForProfile, attendanceLogs]);

  // Monthly attendance data calculated from live logs of the SELECTED employee
  const monthlyData = useMemo(() => {
    if (!selectedEmployeeForProfile) return [];
    
    const currentYear = new Date().getFullYear().toString();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonthIdx = new Date().getMonth();

    return months.map((monthName, index) => {
      if (index > currentMonthIdx) {
        return {
          label: monthName,
          present: 0,
          late: 0,
          absent: 0,
          presentPercent: 0,
          latePercent: 0,
          absentPercent: 0,
          isCurrent: false,
          total: 0,
          avgWorkingHours: 0
        };
      }

      // Check if this month is before the employee's creation month
      if (selectedEmployeeForProfile.createdAt) {
        const createdDate = new Date(selectedEmployeeForProfile.createdAt);
        const createdYear = createdDate.getFullYear();
        const createdMonth = createdDate.getMonth();
        const yearInt = parseInt(currentYear);

        if (yearInt < createdYear || (yearInt === createdYear && index < createdMonth)) {
          return {
            label: monthName,
            present: 0,
            late: 0,
            absent: 0,
            presentPercent: 0,
            latePercent: 0,
            absentPercent: 0,
            isCurrent: false,
            total: 0,
            avgWorkingHours: 0,
            minsLate: 0
          };
        }
      }

      // Filter logs of the selected employee in this month
      const logsInMonth = attendanceLogs.filter(log => {
        const parts = log.date.split(' ');
        const logMonth = parts[0];
        const logYear = parts[2] || '';
        return log.employeeId === selectedEmployeeForProfile.id && logMonth === monthName && logYear.includes(currentYear);
      });

      // If no logs recorded at all for this month, show empty
      if (logsInMonth.length === 0) {
        return {
          label: monthName,
          present: 0,
          late: 0,
          absent: 0,
          presentPercent: 0,
          latePercent: 0,
          absentPercent: 0,
          isCurrent: index === currentMonthIdx,
          total: 0,
          avgWorkingHours: 0,
          minsLate: 0
        };
      }

      let present = 0;
      let late = 0;
      let absent = 0;
      let totalHoursSum = 0;
      let totalMinsLate = 0;

      logsInMonth.forEach(log => {
        if (log.status === 'Present') present++;
        else if (log.status === 'Late') late++;
        else if (log.status === 'Absent') absent++;
        totalHoursSum += parseTotalHoursToDecimal(log.totalHours);
        totalMinsLate += calculateMinutesLate(log.clockIn);
      });

      const total = present + late + absent;
      const presentPercent = total > 0 ? (present / total) * 100 : 0;
      const latePercent = total > 0 ? (late / total) * 100 : 0;
      const absentPercent = total > 0 ? (absent / total) * 100 : 0;
      const avgWorkingHours = logsInMonth.length > 0 ? totalHoursSum / logsInMonth.length : 0;

      return {
        label: monthName,
        present,
        late,
        absent,
        presentPercent,
        latePercent,
        absentPercent,
        isCurrent: index === currentMonthIdx,
        total,
        avgWorkingHours,
        minsLate: totalMinsLate
      };
    });
  }, [selectedEmployeeForProfile, attendanceLogs]);

  // Yearly attendance data calculated from live logs of the SELECTED employee
  const yearlyData = useMemo(() => {
    if (!selectedEmployeeForProfile) return [];

    const years = ['2022', '2023', '2024', '2025', '2026'];
    const currentYear = new Date().getFullYear().toString();

    return years.map(yearName => {
      const logsInYear = attendanceLogs.filter(log => {
        const parts = log.date.split(' ');
        const logYear = parts[2] || '';
        return log.employeeId === selectedEmployeeForProfile.id && logYear.includes(yearName);
      });

      // Check if this year is before the employee's creation year
      if (selectedEmployeeForProfile.createdAt) {
        const createdDate = new Date(selectedEmployeeForProfile.createdAt);
        const createdYear = createdDate.getFullYear();
        const yearInt = parseInt(yearName);

        if (yearInt < createdYear) {
          return {
            label: yearName,
            present: 0,
            late: 0,
            absent: 0,
            presentPercent: 0,
            latePercent: 0,
            absentPercent: 0,
            isCurrent: yearName === currentYear,
            total: 0,
            avgWorkingHours: 0,
            minsLate: 0
          };
        }
      }

      // If no logs for this year, show empty
      if (logsInYear.length === 0) {
        return {
          label: yearName,
          present: 0,
          late: 0,
          absent: 0,
          presentPercent: 0,
          latePercent: 0,
          absentPercent: 0,
          isCurrent: yearName === currentYear,
          total: 0,
          avgWorkingHours: 0,
          minsLate: 0
        };
      }

      let present = 0;
      let late = 0;
      let absent = 0;
      let totalHoursSum = 0;
      let totalMinsLate = 0;

      logsInYear.forEach(log => {
        if (log.status === 'Present') present++;
        else if (log.status === 'Late') late++;
        else if (log.status === 'Absent') absent++;
        totalHoursSum += parseTotalHoursToDecimal(log.totalHours);
        totalMinsLate += calculateMinutesLate(log.clockIn);
      });

      const total = present + late + absent;
      const presentPercent = total > 0 ? (present / total) * 100 : 0;
      const latePercent = total > 0 ? (late / total) * 100 : 0;
      const absentPercent = total > 0 ? (absent / total) * 100 : 0;
      const avgWorkingHours = logsInYear.length > 0 ? totalHoursSum / logsInYear.length : 0;

      return {
        label: yearName,
        present,
        late,
        absent,
        presentPercent,
        latePercent,
        absentPercent,
        isCurrent: yearName === currentYear,
        total,
        avgWorkingHours,
        minsLate: totalMinsLate
      };
    });
  }, [selectedEmployeeForProfile, attendanceLogs]);

  // Combined chartData based on selected filter
  const chartData = useMemo(() => {
    if (trendFilter === 'weekly') return weeklyData;
    if (trendFilter === 'monthly') return monthlyData;
    return yearlyData;
  }, [trendFilter, weeklyData, monthlyData, yearlyData]);

  // Max hours scale calculator for the working hours chart
  const maxHoursScale = useMemo(() => {
    let maxVal = 10; // default minimum ceiling
    chartData.forEach(item => {
      if (item.avgWorkingHours && item.avgWorkingHours > maxVal) {
        maxVal = item.avgWorkingHours;
      }
    });
    return Math.ceil(maxVal);
  }, [chartData]);

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

  // Export Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isProfileExportModalOpen, setIsProfileExportModalOpen] = useState<boolean>(false);
  const [exportStartDate, setExportStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [exportEndDate, setExportEndDate] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

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
        activeNow: emp.active_now,
        createdAt: emp.created_at
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
    if (username.trim() === 'Z-Hajirii' && password === 'Admin@Hajirii') {
      setIsLoggedIn(true);
      setLoginError('');
      showToast('Successfully authenticated as admin.');
    } else {
      setLoginError('Invalid username or password. Please use Z-Hajirii / Admin@Hajirii');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    showToast('Logged out successfully.');
  };

  // Create or Update Employee flow
  const handleSubmitEmployee = async (e: FormEvent) => {
    e.preventDefault();
    if (!newEmpName.trim() || !newEmpEmail.trim() || !newEmpId.trim()) {
      showToast('Please fill in all required fields.');
      return;
    }

    if (editingEmployee) {
      // Edit mode
      const dbEmp = {
        name: newEmpName.trim(),
        role: selectedRoles.join(', '),
        email: newEmpEmail.trim(),
        emp_id: newEmpId.trim().toUpperCase(),
        avatar_url: newEmpAvatar.trim() || editingEmployee.avatarUrl
      };

      try {
        const { error } = await supabase
          .from('employees')
          .update(dbEmp)
          .eq('id', editingEmployee.id);
        
        if (error) throw error;

        setIsCreateModalOpen(false);
        setEditingEmployee(null);
        // Reset forms
        setNewEmpName('');
        setSelectedRoles(['Software Engineer']);
        setNewEmpEmail('');
        setNewEmpId('');
        setNewEmpAvatar('');
        showToast(`Employee ${dbEmp.name} updated successfully!`);
        await fetchData();
      } catch (err) {
        console.error(err);
        showToast('Failed to update employee in database.');
      }
    } else {
      // Create mode
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
        const autoStatus = calculateMinutesLate(timeStr) > 0 ? 'Late' : 'Present';
        const dbLog = {
          id: `rec-${Date.now()}`,
          employee_id: newEmpIdStr,
          date: todayDateString,
          clock_in: timeStr,
          clock_out: '--:--',
          total_hours: '0h 00m',
          status: autoStatus
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

    let clockIn = (existingLog && existingLog.clockIn && existingLog.clockIn !== '--:--') ? existingLog.clockIn : timeStr;
    let clockOut = (existingLog && existingLog.clockOut) ? existingLog.clockOut : '--:--';
    let totalHours = (existingLog && existingLog.totalHours) ? existingLog.totalHours : '0h 00m';

    if (status === 'Absent') {
      clockIn = '--:--';
      clockOut = '--:--';
      totalHours = '0h 00m';
    }

    let finalStatus = status;
    if (finalStatus !== 'Absent') {
      const minsLate = calculateMinutesLate(clockIn);
      finalStatus = minsLate > 0 ? 'Late' : 'Present';
    }

    try {
      if (existingLog) {
        const { error } = await supabase
          .from('attendance_logs')
          .update({
            status: finalStatus,
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
            status: finalStatus
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

  // Export attendance data as CSV daywise report for all users in date range
  const handleExportCSV = (startDateStr: string, endDateStr: string) => {
    const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
    const startDate = new Date(startYear, startMonth - 1, startDay);

    const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
    const endDate = new Date(endYear, endMonth - 1, endDay);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      showToast('Please select valid start and end dates.');
      return;
    }
    if (startDate > endDate) {
      showToast('Start date cannot be after end date.');
      return;
    }

    const getDatesInRange = (start: Date, end: Date): Date[] => {
      const dates: Date[] = [];
      const curr = new Date(start);
      curr.setHours(0,0,0,0);
      const endLimit = new Date(end);
      endLimit.setHours(0,0,0,0);
      while (curr <= endLimit) {
        dates.push(new Date(curr));
        curr.setDate(curr.getDate() + 1);
      }
      return dates;
    };

    const dates = getDatesInRange(startDate, endDate);
    let csvContent = 'Date,Employee ID,Employee Name,Role,Status,Clock In,Clock Out,Total Working Hours,Break Time (mins),Productive Hours\n';

    dates.forEach(dateObj => {
      const dateStr = formatDateString(dateObj);
      const isSunday = dateObj.getDay() === 0;

      employees.forEach(emp => {
        const log = attendanceLogs.find(l => l.employeeId === emp.id && l.date === dateStr);
        let status = 'Absent';
        let clockIn = '--:--';
        let clockOut = '--:--';
        let totalHours = '0h 00m';

        if (log) {
          status = log.status;
          clockIn = log.clockIn || '--:--';
          clockOut = log.clockOut || '--:--';
          totalHours = log.totalHours || '0h 00m';
        } else if (isSunday) {
          status = 'Weekend';
        }

        // Escape fields to prevent CSV injection or breaking on commas
        const escapedName = `"${emp.name.replace(/"/g, '""')}"`;
        const escapedRole = `"${emp.role.replace(/"/g, '""')}"`;
        
        const rawHours = totalHours.split('|')[0];
        const breakMins = getBreakMinutes(totalHours);
        const productiveHours = getProductiveHoursStr(totalHours);

        csvContent += `${dateStr},${emp.empId},${escapedName},${escapedRole},${status},${clockIn},${clockOut},${rawHours},${breakMins},${productiveHours}\n`;
      });
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Attendance_Report_${startDateStr}_to_${endDateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Report exported successfully!');
    setIsExportModalOpen(false);
  };

  // Export attendance data as CSV daywise report for a specific user in date range
  const handleExportProfileCSV = (employee: Employee, startDateStr: string, endDateStr: string) => {
    const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
    const startDate = new Date(startYear, startMonth - 1, startDay);

    const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
    const endDate = new Date(endYear, endMonth - 1, endDay);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      showToast('Please select valid start and end dates.');
      return;
    }
    if (startDate > endDate) {
      showToast('Start date cannot be after end date.');
      return;
    }

    const getDatesInRange = (start: Date, end: Date): Date[] => {
      const dates: Date[] = [];
      const curr = new Date(start);
      curr.setHours(0,0,0,0);
      const endLimit = new Date(end);
      endLimit.setHours(0,0,0,0);
      while (curr <= endLimit) {
        dates.push(new Date(curr));
        curr.setDate(curr.getDate() + 1);
      }
      return dates;
    };

    const dates = getDatesInRange(startDate, endDate);
    let csvContent = `Employee Profile Report\n`;
    csvContent += `Employee Name,${employee.name}\n`;
    csvContent += `Employee ID,${employee.empId}\n`;
    csvContent += `Role,${employee.role}\n`;
    csvContent += `Email,${employee.email}\n\n`;
    csvContent += 'Date,Status,Clock In,Clock Out,Total Working Hours,Break Time (mins),Productive Hours,Minutes Late\n';

    dates.forEach(dateObj => {
      const dateStr = formatDateString(dateObj);
      const isSunday = dateObj.getDay() === 0;
      const log = attendanceLogs.find(l => l.employeeId === employee.id && l.date === dateStr);

      let status = 'Absent';
      let clockIn = '--:--';
      let clockOut = '--:--';
      let totalHours = '0h 00m';
      let minsLate = 0;

      if (log) {
        status = log.status;
        clockIn = log.clockIn || '--:--';
        clockOut = log.clockOut || '--:--';
        totalHours = log.totalHours || '0h 00m';
        if (log.clockIn) {
          minsLate = calculateMinutesLate(log.clockIn);
        }
      } else if (isSunday) {
        status = 'Weekend';
      }

      const rawHours = totalHours.split('|')[0];
      const breakMins = getBreakMinutes(totalHours);
      const productiveHours = getProductiveHoursStr(totalHours);

      csvContent += `${dateStr},${status},${clockIn},${clockOut},${rawHours},${breakMins},${productiveHours},${minsLate}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${employee.name.replace(/\s+/g, '_')}_Attendance_${startDateStr}_to_${endDateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported report for ${employee.name} successfully!`);
    setIsProfileExportModalOpen(false);
  };

  // Export attendance data as PDF report for a specific employee in date range
  const handleExportProfilePDF = (employee: Employee, startDateStr: string, endDateStr: string) => {
    const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
    const startDate = new Date(startYear, startMonth - 1, startDay);

    const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
    const endDate = new Date(endYear, endMonth - 1, endDay);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      showToast('Please select valid start and end dates.');
      return;
    }
    if (startDate > endDate) {
      showToast('Start date cannot be after end date.');
      return;
    }

    const getDatesInRange = (start: Date, end: Date): Date[] => {
      const dates: Date[] = [];
      const curr = new Date(start);
      curr.setHours(0,0,0,0);
      const endLimit = new Date(end);
      endLimit.setHours(0,0,0,0);
      while (curr <= endLimit) {
        dates.push(new Date(curr));
        curr.setDate(curr.getDate() + 1);
      }
      return dates;
    };

    const dates = getDatesInRange(startDate, endDate);

    let totalDays = 0;
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let weekendCount = 0;

    const tableRows = dates.map(dateObj => {
      const dateStr = formatDateString(dateObj);
      const isSunday = dateObj.getDay() === 0;
      const log = attendanceLogs.find(l => l.employeeId === employee.id && l.date === dateStr);

      let status = 'Absent';
      let clockIn = '--:--';
      let clockOut = '--:--';
      let totalHours = '0h 00m';
      let minsLate = 0;

      if (log) {
        status = log.status;
        clockIn = log.clockIn || '--:--';
        clockOut = log.clockOut || '--:--';
        totalHours = log.totalHours || '0h 00m';
        if (log.clockIn) {
          minsLate = calculateMinutesLate(log.clockIn);
        }
      } else if (isSunday) {
        status = 'Weekend';
      }

      totalDays++;
      if (status === 'Present') presentCount++;
      else if (status === 'Late') lateCount++;
      else if (status === 'Absent') absentCount++;
      else if (status === 'Weekend') weekendCount++;

      const rawHours = totalHours.split('|')[0];
      const breakMins = getBreakMinutes(totalHours);
      const productiveHours = getProductiveHoursStr(totalHours);

      return `
        <tr>
          <td>${dateStr}</td>
          <td><span class="badge badge-${status.toLowerCase()}">${status}</span></td>
          <td>${clockIn}</td>
          <td>${clockOut}</td>
          <td>${rawHours}</td>
          <td>${breakMins > 0 ? breakMins + ' mins' : '--'}</td>
          <td><strong>${productiveHours}</strong></td>
          <td>${minsLate > 0 ? minsLate + ' mins' : '--'}</td>
        </tr>
      `;
    }).join('');

    const attendanceRate = (totalDays - weekendCount) > 0 
      ? (((presentCount + lateCount) / (totalDays - weekendCount)) * 100).toFixed(1) + '%' 
      : '100.0%';

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Popup blocked! Please allow popups to export PDF.');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Attendance Report - ${employee.name}</title>
        <style>
          body {
            font-family: 'Inter', -apple-system, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 40px;
            background-color: #ffffff;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .title {
            font-size: 24px;
            font-weight: bold;
            color: #0f4c81;
          }
          .date-range {
            font-size: 14px;
            color: #64748b;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
          }
          .meta-card {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 15px;
          }
          .meta-title {
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 8px;
          }
          .meta-value {
            font-size: 16px;
            font-weight: 600;
            color: #0f4c81;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin-bottom: 40px;
          }
          .stat-card {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
          }
          .stat-num {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .stat-num.present { color: #10b981; }
          .stat-num.late { color: #f59e0b; }
          .stat-num.absent { color: #ef4444; }
          .stat-num.rate { color: #0f4c81; }
          .stat-label {
            font-size: 11px;
            font-weight: bold;
            color: #64748b;
            text-transform: uppercase;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th {
            background-color: #f1f5f9;
            color: #475569;
            font-size: 12px;
            text-transform: uppercase;
            font-weight: bold;
            text-align: left;
            padding: 12px;
            border-bottom: 2px solid #cbd5e1;
          }
          td {
            padding: 12px;
            font-size: 13px;
            border-bottom: 1px solid #e2e8f0;
          }
          .badge {
            display: inline-block;
            padding: 4px 8px;
            font-size: 11px;
            font-weight: bold;
            border-radius: 4px;
          }
          .badge-present { background-color: #d1fae5; color: #065f46; }
          .badge-late { background-color: #fef3c7; color: #92400e; }
          .badge-absent { background-color: #fee2e2; color: #991b1b; }
          .badge-weekend { background-color: #f1f5f9; color: #475569; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">Z-HAJIRII ATTENDANCE PROFILE REPORT</div>
            <div class="date-range">Report Period: ${startDateStr} to ${endDateStr}</div>
          </div>
          <div class="no-print">
            <button onclick="window.print()" style="padding: 10px 20px; background-color: #0f4c81; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Print / Save as PDF</button>
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-card">
            <div class="meta-title">Employee Details</div>
            <div style="font-size: 15px; font-weight: bold; color: #1e293b;">${employee.name}</div>
            <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Role: ${employee.role}</div>
            <div style="font-size: 13px; color: #64748b;">Email: ${employee.email}</div>
          </div>
          <div class="meta-card">
            <div class="meta-title">Corporate Information</div>
            <div style="font-size: 15px; font-weight: bold; color: #1e293b;">Corporate ID: ${employee.empId}</div>
            <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Generated On: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
            <div style="font-size: 13px; color: #64748b;">Status: Active Corporate Member</div>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-num present">${presentCount + lateCount}</div>
            <div class="stat-label">Total Present</div>
          </div>
          <div class="stat-card">
            <div class="stat-num late">${lateCount}</div>
            <div class="stat-label">Late Arrivals</div>
          </div>
          <div class="stat-card">
            <div class="stat-num absent">${absentCount}</div>
            <div class="stat-label">Total Absent</div>
          </div>
          <div class="stat-card">
            <div class="stat-num rate">${attendanceRate}</div>
            <div class="stat-label">Attendance Rate</div>
          </div>
        </div>

        <div style="font-weight: bold; font-size: 16px; color: #0f4c81; margin-bottom: 10px;">Daywise Attendance Records</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Clock In</th>
              <th>Clock Out</th>
              <th>Total Hours</th>
              <th>Break</th>
              <th>Productive Hours</th>
              <th>Late Duration</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    showToast(`PDF Report generated for ${employee.name}`);
    setIsProfileExportModalOpen(false);
  };

  // Export attendance data as PDF report overall for all users in date range
  const handleExportOverallPDF = (startDateStr: string, endDateStr: string) => {
    const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
    const startDate = new Date(startYear, startMonth - 1, startDay);

    const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
    const endDate = new Date(endYear, endMonth - 1, endDay);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      showToast('Please select valid start and end dates.');
      return;
    }
    if (startDate > endDate) {
      showToast('Start date cannot be after end date.');
      return;
    }

    const getDatesInRange = (start: Date, end: Date): Date[] => {
      const dates: Date[] = [];
      const curr = new Date(start);
      curr.setHours(0,0,0,0);
      const endLimit = new Date(end);
      endLimit.setHours(0,0,0,0);
      while (curr <= endLimit) {
        dates.push(new Date(curr));
        curr.setDate(curr.getDate() + 1);
      }
      return dates;
    };

    const dates = getDatesInRange(startDate, endDate);

    let totalWorkingDays = 0;
    let totalPresentSum = 0;
    let totalLateSum = 0;
    let totalAbsentSum = 0;

    let tableRows = '';

    dates.forEach(dateObj => {
      const dateStr = formatDateString(dateObj);
      const isSunday = dateObj.getDay() === 0;
      if (!isSunday) totalWorkingDays++;

      employees.forEach(emp => {
        const log = attendanceLogs.find(l => l.employeeId === emp.id && l.date === dateStr);
        let status = 'Absent';
        let clockIn = '--:--';
        let clockOut = '--:--';
        let totalHours = '0h 00m';

        if (log) {
          status = log.status;
          clockIn = log.clockIn || '--:--';
          clockOut = log.clockOut || '--:--';
          totalHours = log.totalHours || '0h 00m';
        } else if (isSunday) {
          status = 'Weekend';
        }

        if (status === 'Present') totalPresentSum++;
        else if (status === 'Late') totalLateSum++;
        else if (status === 'Absent') totalAbsentSum++;

        const rawHours = totalHours.split('|')[0];
        const breakMins = getBreakMinutes(totalHours);
        const productiveHours = getProductiveHoursStr(totalHours);

        tableRows += `
          <tr>
            <td>${dateStr}</td>
            <td>${emp.empId}</td>
            <td><strong>${emp.name}</strong></td>
            <td>${emp.role}</td>
            <td><span class="badge badge-${status.toLowerCase()}">${status}</span></td>
            <td>${clockIn}</td>
            <td>${clockOut}</td>
            <td>${rawHours}</td>
            <td>${breakMins > 0 ? breakMins + ' mins' : '--'}</td>
            <td><strong>${productiveHours}</strong></td>
          </tr>
        `;
      });
    });

    const averageRate = totalWorkingDays > 0 && employees.length > 0
      ? (((totalPresentSum + totalLateSum) / (totalWorkingDays * employees.length)) * 100).toFixed(1) + '%'
      : '100.0%';

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Popup blocked! Please allow popups to export PDF.');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Z-Hajirii Overall Attendance Report</title>
        <style>
          body {
            font-family: 'Inter', -apple-system, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 40px;
            background-color: #ffffff;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .title {
            font-size: 24px;
            font-weight: bold;
            color: #0f4c81;
          }
          .date-range {
            font-size: 14px;
            color: #64748b;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin-bottom: 40px;
          }
          .stat-card {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
            background-color: #f8fafc;
          }
          .stat-num {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .stat-num.employees { color: #0f4c81; }
          .stat-num.present { color: #10b981; }
          .stat-num.late { color: #f59e0b; }
          .stat-num.rate { color: #10b981; }
          .stat-label {
            font-size: 11px;
            font-weight: bold;
            color: #64748b;
            text-transform: uppercase;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th {
            background-color: #f1f5f9;
            color: #475569;
            font-size: 12px;
            text-transform: uppercase;
            font-weight: bold;
            text-align: left;
            padding: 12px;
            border-bottom: 2px solid #cbd5e1;
          }
          td {
            padding: 12px;
            font-size: 13px;
            border-bottom: 1px solid #e2e8f0;
          }
          .badge {
            display: inline-block;
            padding: 4px 8px;
            font-size: 11px;
            font-weight: bold;
            border-radius: 4px;
          }
          .badge-present { background-color: #d1fae5; color: #065f46; }
          .badge-late { background-color: #fef3c7; color: #92400e; }
          .badge-absent { background-color: #fee2e2; color: #991b1b; }
          .badge-weekend { background-color: #f1f5f9; color: #475569; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">Z-HAJIRII OVERALL ATTENDANCE REPORT</div>
            <div class="date-range">Report Period: ${startDateStr} to ${endDateStr}</div>
          </div>
          <div class="no-print">
            <button onclick="window.print()" style="padding: 10px 20px; background-color: #0f4c81; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Print / Save as PDF</button>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-num employees">${employees.length}</div>
            <div class="stat-label">Total Employees</div>
          </div>
          <div class="stat-card">
            <div class="stat-num present">${totalPresentSum + totalLateSum}</div>
            <div class="stat-label">Total Present Records</div>
          </div>
          <div class="stat-card">
            <div class="stat-num late">${totalLateSum}</div>
            <div class="stat-label">Total Late Records</div>
          </div>
          <div class="stat-card">
            <div class="stat-num rate">${averageRate}</div>
            <div class="stat-label">Average Attendance Rate</div>
          </div>
        </div>

        <div style="font-weight: bold; font-size: 16px; color: #0f4c81; margin-bottom: 10px;">Detailed Daywise Log (All Employees)</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Emp ID</th>
              <th>Employee Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Clock In</th>
              <th>Clock Out</th>
              <th>Total Hours</th>
              <th>Break</th>
              <th>Productive Hours</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    showToast(`PDF Report generated for overall records`);
    setIsExportModalOpen(false);
  };

  // Save changes to edited attendance log
  const handleSaveAttendanceEdit = async (logId: string) => {
    const inTimeStr = editStatus === 'Absent' ? '--:--' : time24To12(editClockIn);
    const outTimeStr = editStatus === 'Absent' ? '--:--' : time24To12(editClockOut);
    const totalHours = calculateDuration(inTimeStr, outTimeStr);
    
    const existingLog = attendanceLogs.find(l => l.id === logId);
    const breakMins = existingLog ? getBreakMinutes(existingLog.totalHours) : 0;
    const updatedTotalHours = breakMins > 0 ? `${totalHours}|${breakMins}` : totalHours;

    let finalStatus = editStatus;
    if (finalStatus !== 'Absent' && inTimeStr !== '--:--') {
      const minsLate = calculateMinutesLate(inTimeStr);
      finalStatus = minsLate > 0 ? 'Late' : 'Present';
    }

    try {
      const { error } = await supabase
        .from('attendance_logs')
        .update({
          clock_in: inTimeStr,
          clock_out: outTimeStr,
          total_hours: updatedTotalHours,
          status: finalStatus
        })
        .eq('id', logId);

      if (error) throw error;

      showToast('Attendance log updated successfully.');
      setEditingLogId(null);
      await fetchData();
    } catch (err) {
      console.error(err);
      showToast('Failed to update attendance log.');
    }
  };

  // Update break minutes for an attendance record dynamically
  const handleUpdateBreakMinutes = async (logId: string, breakMins: number) => {
    const existingLog = attendanceLogs.find(l => l.id === logId);
    if (!existingLog) {
      showToast('Attendance log not found.');
      return;
    }

    const rawHoursStr = existingLog.totalHours.split('|')[0];
    const updatedTotalHours = breakMins > 0 ? `${rawHoursStr}|${breakMins}` : rawHoursStr;

    try {
      const { error } = await supabase
        .from('attendance_logs')
        .update({
          total_hours: updatedTotalHours
        })
        .eq('id', logId);

      if (error) throw error;

      showToast('Break time updated.');
      await fetchData();
    } catch (err) {
      console.error(err);
      showToast('Failed to update break time.');
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
      // Find log for the selected dashboard date
      const todayLog = attendanceLogs.find(log => log.employeeId === emp.id && log.date === dashboardDate);
      if (todayLog) {
        if (todayLog.status === 'Present') present += 1;
        else if (todayLog.status === 'Absent') absent += 1;
        else if (todayLog.status === 'Late') late += 1;
      } else {
        // If no log is registered for this date, assume absent or un-logged
        absent += 1;
      }
    });

    return {
      totalEmployees: total,
      present,
      absent,
      late
    };
  }, [employees, attendanceLogs, dashboardDate]);

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
            <div className="flex-1 lg:ml-64 p-4 sm:p-6 pb-24 sm:pb-28 lg:pb-6 overflow-y-auto w-full space-y-6">
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
                      <p className="text-sm text-on-surface-variant font-medium">Real-time presence tracking for {dashboardFullDateString}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                      <div className="flex items-center bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 hover:bg-surface-container-low transition-all">
                        <span className="mr-2 text-primary font-bold text-xs uppercase tracking-wider">Date:</span>
                        <input
                          type="date"
                          value={(() => {
                            const d = parseDateString(dashboardDate);
                            const yyyy = d.getFullYear();
                            const mm = String(d.getMonth() + 1).padStart(2, '0');
                            const dd = String(d.getDate()).padStart(2, '0');
                            return `${yyyy}-${mm}-${dd}`;
                          })()}
                          onChange={(e) => {
                            if (e.target.value) {
                              const [year, month, day] = e.target.value.split('-').map(Number);
                              const d = new Date(year, month - 1, day);
                              setDashboardDate(formatDateString(d));
                            }
                          }}
                          className="bg-transparent border-none font-semibold text-sm text-primary focus:outline-none cursor-pointer focus:ring-0 p-0"
                        />
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
                        <h3 className="text-emerald-700 font-bold text-[32px]">{stats.present + stats.late}</h3>
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
                             // Find log for dashboardDate
                             const log = attendanceLogs.find(l => l.employeeId === emp.id && l.date === dashboardDate);
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
                                    <div className="flex flex-col items-center gap-1 select-none">
                                      <span className="px-4 py-1.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold inline-flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5 text-amber-600" /> Late
                                      </span>
                                      {log?.clockIn && calculateMinutesLate(log.clockIn) > 0 && (
                                        <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/50 whitespace-nowrap">
                                          Late by {calculateMinutesLate(log.clockIn)} mins
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      title="Mark Present"
                                      onClick={() => handleUpdateStatus(emp.id, 'Present', dashboardDate)}
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
                                      onClick={() => handleUpdateStatus(emp.id, 'Absent', dashboardDate)}
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
                                      onClick={() => handleUpdateStatus(emp.id, 'Late', dashboardDate)}
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
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => setIsExportModalOpen(true)}
                        className="bg-primary hover:brightness-110 active:scale-[0.98] text-on-primary px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all shadow-md cursor-pointer"
                      >
                        <Download className="w-4 h-4 text-emerald-400" />
                        <span>Export Report</span>
                      </button>
                      <button
                        onClick={() => {
                          // Mark all employees present as quick-run tool
                          employees.forEach(emp => {
                            handleUpdateStatus(emp.id, 'Present', selectedAttendanceDate);
                          });
                          showToast(`All users marked Present for ${selectedAttendanceDate}.`);
                        }}
                        className="bg-emerald-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-emerald-700 active:scale-95 transition-all shadow-md cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>Auto-Checkin All</span>
                      </button>
                    </div>
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
                              <div className="flex flex-col items-end gap-1">
                                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                                  status === 'Present' ? 'bg-emerald-100 text-emerald-800' :
                                  status === 'Late' ? 'bg-amber-100 text-amber-800' :
                                  'bg-error-container/40 text-error'
                                }`}>
                                  {status}
                                </span>
                                {status === 'Late' && log?.clockIn && calculateMinutesLate(log.clockIn) > 0 && (
                                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/50 whitespace-nowrap">
                                    Late by {calculateMinutesLate(log.clockIn)} mins
                                  </span>
                                )}
                              </div>
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
                      onClick={() => {
                        setEditingEmployee(null);
                        setNewEmpName('');
                        setSelectedRoles(['Software Engineer']);
                        setNewEmpEmail('');
                        setNewEmpId('');
                        setNewEmpAvatar('');
                        setIsCreateModalOpen(true);
                      }}
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
                              setEditingEmployee(emp);
                              setNewEmpName(emp.name);
                              setNewEmpId(emp.empId);
                              setNewEmpEmail(emp.email);
                              setSelectedRoles(emp.role.split(',').map(r => r.trim()));
                              setNewEmpAvatar(emp.avatarUrl);
                              setIsCreateModalOpen(true);
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
                        onClick={() => setIsProfileExportModalOpen(true)}
                        className="px-6 py-2 border border-primary text-primary font-semibold text-sm rounded-lg hover:bg-primary/5 transition-colors cursor-pointer"
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
                        <p className="text-2xl font-bold">{profileStats.present + profileStats.late}</p>
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

                    {/* Attendance Trends chart */}
                    <div className="bg-surface-container-lowest custom-shadow rounded-xl p-6 lg:col-span-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <h3 className="font-bold text-lg text-on-surface capitalize">{trendFilter} {chartMetric === 'status' ? 'Attendance' : 'Working Hours'} Trend</h3>
                        
                        <div className="flex flex-wrap gap-2">
                          {/* Metric Toggle */}
                          <div className="flex gap-1 bg-surface-container-low p-1 rounded-lg text-[11px]">
                            <button 
                              onClick={() => {
                                setChartMetric('status');
                                showToast('Showing attendance status');
                              }}
                              className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${chartMetric === 'status' ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:bg-white/30'}`}
                            >
                              Status
                            </button>
                            <button 
                              onClick={() => {
                                setChartMetric('hours');
                                showToast('Showing working hours vs 8h average');
                              }}
                              className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${chartMetric === 'hours' ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:bg-white/30'}`}
                            >
                              Working Hours
                            </button>
                          </div>

                          {/* Trend Filter Toggle */}
                          <div className="flex gap-1 bg-surface-container-low p-1 rounded-lg text-[11px]">
                            <button 
                              onClick={() => setTrendFilter('weekly')}
                              className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${trendFilter === 'weekly' ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:bg-white/30'}`}
                            >
                              Weekly
                            </button>
                            <button 
                              onClick={() => setTrendFilter('monthly')}
                              className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${trendFilter === 'monthly' ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:bg-white/30'}`}
                            >
                              Monthly
                            </button>
                            <button 
                              onClick={() => setTrendFilter('yearly')}
                              className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${trendFilter === 'yearly' ? 'bg-white shadow-sm text-primary font-bold' : 'text-on-surface-variant hover:bg-white/30'}`}
                            >
                              Yearly
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Simulating custom vector bars based on trendFilter */}
                      <div className="h-64 pt-8 pb-2 pl-12 pr-4 border-b border-outline-variant/30">
                        <div className="relative h-full w-full flex items-end justify-between gap-4">
                          {/* 8-Hour Average Dashed Target Line */}
                          {chartMetric === 'hours' && (
                            <div 
                              className="absolute left-0 right-0 border-t-2 border-dashed border-red-500/40 z-20 pointer-events-none transition-all duration-300"
                              style={{ bottom: `${(8 / maxHoursScale) * 100}%` }}
                            >
                              <span className="absolute right-full mr-2 -top-2 bg-red-50 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-extrabold border border-red-200/60 whitespace-nowrap shadow-sm">
                                8hr
                              </span>
                            </div>
                          )}

                          {chartData.map((item, index) => {
                            const hasData = item.total > 0;
                            
                            // Metric-specific variables
                            const w = item.avgWorkingHours || 0;
                            const exceeds = w >= 8;
                            const workedPct = (Math.min(w, 8) / maxHoursScale) * 100;
                            const excessPct = exceeds ? ((w - 8) / maxHoursScale) * 100 : 0;
                            const deficitPct = !exceeds ? ((8 - w) / maxHoursScale) * 100 : 0;

                            return (
                              <div key={index} className="flex-1 flex flex-col justify-end h-full relative group">
                                {/* Stacked Bar container */}
                                {hasData ? (
                                  <div className={`w-full flex flex-col justify-end rounded-t-md overflow-hidden transition-all duration-300 ${item.isToday || item.isCurrent ? 'ring-2 ring-primary ring-offset-2' : ''}`} style={{ height: '100%' }}>
                                    {chartMetric === 'status' ? (
                                      <>
                                        {/* Present Segment */}
                                        {item.presentPercent > 0 && (
                                          <div 
                                            className="bg-emerald-500 hover:brightness-105 transition-all" 
                                            style={{ height: `${item.presentPercent}%` }}
                                            title={`Present: ${item.presentPercent.toFixed(0)}%`}
                                          />
                                        )}
                                        {/* Late Segment */}
                                        {item.latePercent > 0 && (
                                          <div 
                                            className="bg-amber-500 hover:brightness-105 transition-all" 
                                            style={{ height: `${item.latePercent}%` }}
                                            title={`Late: ${item.latePercent.toFixed(0)}%`}
                                          />
                                        )}
                                        {/* Absent Segment */}
                                        {item.absentPercent > 0 && (
                                          <div 
                                            className="bg-red-500 hover:brightness-105 transition-all" 
                                            style={{ height: `${item.absentPercent}%` }}
                                            title={`Absent: ${item.absentPercent.toFixed(0)}%`}
                                          />
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        {exceeds ? (
                                          <>
                                            {/* Blue Overtime Segment */}
                                            {excessPct > 0 && (
                                              <div 
                                                className="bg-blue-500 hover:brightness-105 transition-all" 
                                                style={{ height: `${excessPct}%` }}
                                              />
                                            )}
                                            {/* Standard Worked Base Segment */}
                                            {workedPct > 0 && (
                                              <div 
                                                className="bg-slate-300 hover:brightness-105 transition-all" 
                                                style={{ height: `${workedPct}%` }}
                                              />
                                            )}
                                          </>
                                        ) : (
                                          <>
                                            {/* Yellow Deficit Segment */}
                                            {deficitPct > 0 && (
                                              <div 
                                                className="bg-yellow-400 hover:brightness-105 transition-all" 
                                                style={{ height: `${deficitPct}%` }}
                                              />
                                            )}
                                            {/* Worked Base Segment */}
                                            {workedPct > 0 && (
                                              <div 
                                                className="bg-slate-300 hover:brightness-105 transition-all" 
                                                style={{ height: `${workedPct}%` }}
                                              />
                                            )}
                                          </>
                                        )}
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  /* No Data placeholder (e.g. future date or weekend) */
                                  <div className="w-full h-1 bg-outline-variant/20 rounded-full" />
                                )}

                                {/* Tooltip on hover */}
                                {hasData && (
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-900/95 backdrop-blur-md text-white text-[10px] p-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-nowrap border border-white/10">
                                    {chartMetric === 'status' ? (
                                      <>
                                        <p className="font-bold text-center border-b border-white/10 pb-1 mb-1">{item.label} Attendance</p>
                                        <p className="flex items-center gap-1.5"><span className="w-2 h-2 bg-emerald-500 rounded-full"></span> Present: {item.present} ({item.presentPercent.toFixed(0)}%)</p>
                                        <p className="flex items-center gap-1.5"><span className="w-2 h-2 bg-amber-500 rounded-full"></span> Late: {item.late} ({item.latePercent.toFixed(0)}%)</p>
                                        <p className="flex items-center gap-1.5"><span className="w-2 h-2 bg-red-500 rounded-full"></span> Absent: {item.absent} ({item.absentPercent.toFixed(0)}%)</p>
                                        {item.minsLate > 0 && (
                                          <p className="text-amber-400 font-bold border-t border-white/10 pt-1 mt-1 flex items-center gap-1">
                                            ⚠️ {trendFilter === 'Weekly' ? `Late by ${item.minsLate} mins` : `Late total: ${item.minsLate} mins`}
                                          </p>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <p className="font-bold text-center border-b border-white/10 pb-1 mb-1">{item.label} Working Hours</p>
                                        <p className="flex items-center gap-1.5">
                                          <span className="w-2 h-2 bg-slate-300 rounded-full"></span> 
                                          Worked: {w.toFixed(2)}h
                                        </p>
                                        {w >= 8 ? (
                                          <p className="flex items-center gap-1.5 text-blue-400 font-semibold">
                                            <span className="w-2 h-2 bg-blue-500 rounded-full"></span> 
                                            Exceeds Average: +{(w - 8).toFixed(2)}h
                                          </p>
                                        ) : (
                                          <p className="flex items-center gap-1.5 text-yellow-400 font-semibold">
                                            <span className="w-2 h-2 bg-yellow-400 rounded-full"></span> 
                                            Deficit Hours: -{(8 - w).toFixed(2)}h
                                          </p>
                                        )}
                                        {item.minsLate > 0 && (
                                          <p className="text-amber-400 font-bold border-t border-white/10 pt-1 mt-1 flex items-center gap-1">
                                            ⚠️ {trendFilter === 'Weekly' ? `Late by ${item.minsLate} mins` : `Late total: ${item.minsLate} mins`}
                                          </p>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                                
                                {/* Weekend label indicator */}
                                {item.isWeekend && (
                                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-on-surface-variant/40 select-none pointer-events-none rotate-90 sm:rotate-0">
                                    Weekend
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* X-Axis labels */}
                      <div className="flex justify-between pl-12 pr-4 mt-4 text-xs font-semibold text-on-surface-variant">
                        {chartData.map((item, index) => (
                          <span 
                            key={index} 
                            className={`flex-1 text-center truncate ${item.isToday || item.isCurrent ? 'text-primary font-bold' : ''}`}
                          >
                            {item.label}
                          </span>
                        ))}
                      </div>

                      {/* Legend */}
                      <div className="flex justify-center gap-6 mt-6 pt-4 border-t border-outline-variant/30 text-xs font-semibold">
                        {chartMetric === 'status' ? (
                          <>
                            <span className="flex items-center gap-2 text-on-surface-variant">
                              <span className="w-3 h-3 bg-emerald-500 rounded-full"></span> Present
                            </span>
                            <span className="flex items-center gap-2 text-on-surface-variant">
                              <span className="w-3 h-3 bg-amber-500 rounded-full"></span> Late
                            </span>
                            <span className="flex items-center gap-2 text-on-surface-variant">
                              <span className="w-3 h-3 bg-red-500 rounded-full"></span> Absent
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="flex items-center gap-2 text-on-surface-variant">
                              <span className="w-3 h-3 bg-slate-300 rounded-full"></span> Standard Base (8h)
                            </span>
                            <span className="flex items-center gap-2 text-on-surface-variant">
                              <span className="w-3 h-3 bg-blue-500 rounded-full"></span> Overtime Exceeded (Blue)
                            </span>
                            <span className="flex items-center gap-2 text-on-surface-variant">
                              <span className="w-3 h-3 bg-yellow-400 rounded-full"></span> Deficit Below Average (Yellow)
                            </span>
                          </>
                        )}
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
                            <th className="px-6 py-3">Working Hours</th>
                            <th className="px-6 py-3">Break</th>
                            <th className="px-6 py-3">Productivity</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/30">
                          {attendanceLogs
                            .filter(log => log.employeeId === selectedEmployeeForProfile.id)
                            .map((log) => {
                              const isEditing = editingLogId === log.id;
                              return (
                                <tr key={log.id} className="hover:bg-primary/5 transition-colors">
                                  <td className="px-6 py-4 font-semibold text-sm">{log.date}</td>
                                  <td className="px-6 py-4 text-sm text-on-surface-variant">
                                    {isEditing ? (
                                      <input
                                        type="time"
                                        disabled={editStatus === 'Absent'}
                                        value={editClockIn}
                                        onChange={(e) => setEditClockIn(e.target.value)}
                                        className="bg-surface-container-low border border-outline-variant rounded p-1 text-sm outline-none focus:ring-1 focus:ring-primary w-28"
                                      />
                                    ) : (
                                      log.clockIn
                                    )}
                                  </td>
                                  <td className="px-6 py-4 text-sm text-on-surface-variant">
                                    {isEditing ? (
                                      <input
                                        type="time"
                                        disabled={editStatus === 'Absent'}
                                        value={editClockOut}
                                        onChange={(e) => setEditClockOut(e.target.value)}
                                        className="bg-surface-container-low border border-outline-variant rounded p-1 text-sm outline-none focus:ring-1 focus:ring-primary w-28"
                                      />
                                    ) : selectedEmployeeForProfile && log.date === todayDateString && (log.status === 'Present' || log.status === 'Late') && (log.clockOut === '--:--' || !log.clockOut) ? (
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
                                  <td className="px-6 py-4 text-sm font-semibold text-primary">
                                    {isEditing ? (
                                      calculateDuration(
                                        editStatus === 'Absent' ? '--:--' : time24To12(editClockIn),
                                        editStatus === 'Absent' ? '--:--' : time24To12(editClockOut)
                                      )
                                    ) : (
                                      log.totalHours.split('|')[0]
                                    )}
                                  </td>
                                  <td className="px-6 py-4">
                                    <select
                                      disabled={log.status === 'Absent' || isEditing}
                                      value={getBreakMinutes(log.totalHours)}
                                      onChange={(e) => handleUpdateBreakMinutes(log.id, parseInt(e.target.value, 10))}
                                      className="bg-surface-container-low border border-outline-variant rounded px-2 py-1 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-white"
                                    >
                                      <option value="0">0 mins</option>
                                      <option value="5">5 mins</option>
                                      <option value="10">10 mins</option>
                                      <option value="15">15 mins</option>
                                      <option value="30">30 mins</option>
                                      <option value="45">45 mins</option>
                                      <option value="60">60 mins</option>
                                      <option value="90">90 mins</option>
                                      <option value="120">120 mins</option>
                                    </select>
                                  </td>
                                  <td className="px-6 py-4 text-sm font-bold text-primary">
                                    {isEditing ? (
                                      getProductiveHoursStr(
                                        calculateDuration(
                                          editStatus === 'Absent' ? '--:--' : time24To12(editClockIn),
                                          editStatus === 'Absent' ? '--:--' : time24To12(editClockOut)
                                        ) + `|${getBreakMinutes(log.totalHours)}`
                                      )
                                    ) : (
                                      getProductiveHoursStr(log.totalHours)
                                    )}
                                  </td>
                                  <td className="px-6 py-4">
                                    {isEditing ? (
                                      <select
                                        value={editStatus}
                                        onChange={(e) => {
                                          const newStatus = e.target.value as 'Present' | 'Absent' | 'Late';
                                          setEditStatus(newStatus);
                                          if (newStatus === 'Absent') {
                                            setEditClockIn('');
                                            setEditClockOut('');
                                          } else {
                                            if (!editClockIn) setEditClockIn('09:00');
                                            if (!editClockOut) setEditClockOut('17:00');
                                          }
                                        }}
                                        className="bg-surface-container-low border border-outline-variant rounded p-1.5 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary"
                                      >
                                        <option value="Present">Present</option>
                                        <option value="Late">Late</option>
                                        <option value="Absent">Absent</option>
                                      </select>
                                    ) : (
                                       <div className="flex flex-col items-start gap-1">
                                         <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                           log.status === 'Present' ? 'bg-emerald-100 text-emerald-800' :
                                           log.status === 'Late' ? 'bg-amber-100 text-amber-800' :
                                           'bg-error-container/40 text-error'
                                         }`}>
                                           {log.status}
                                         </span>
                                         {log.status === 'Late' && log.clockIn && calculateMinutesLate(log.clockIn) > 0 && (
                                           <span className="text-[10px] text-amber-600 font-semibold whitespace-nowrap">
                                             Late by {calculateMinutesLate(log.clockIn)} mins
                                           </span>
                                         )}
                                       </div>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    {isEditing ? (
                                      <div className="flex justify-center items-center gap-1.5">
                                        <button
                                          title="Save Changes"
                                          onClick={() => handleSaveAttendanceEdit(log.id)}
                                          className="p-1.5 rounded-full border border-emerald-600 bg-emerald-600 text-white hover:brightness-110 active:scale-95 transition-all shadow-sm cursor-pointer"
                                        >
                                          <Check className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          title="Cancel"
                                          onClick={() => setEditingLogId(null)}
                                          className="p-1.5 rounded-full border border-outline-variant text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex justify-center items-center gap-1.5">
                                        <button
                                          title="Edit Attendance Log"
                                          onClick={() => {
                                            setEditingLogId(log.id);
                                            setEditClockIn(time12To24(log.clockIn));
                                            setEditClockOut(time12To24(log.clockOut));
                                            setEditStatus(log.status as 'Present' | 'Absent' | 'Late');
                                          }}
                                          className="p-1.5 rounded-full border border-outline-variant text-primary hover:bg-primary/10 hover:border-primary active:scale-95 transition-all cursor-pointer"
                                        >
                                          <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          title="Delete Attendance Log"
                                          onClick={() => handleDeleteAttendance(log.id)}
                                          className="p-1.5 rounded-full border border-outline-variant text-error hover:bg-error-container/20 hover:border-error transition-all"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
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
                {editingEmployee ? <Edit2 className="w-5 h-5 text-emerald-400" /> : <UserPlus className="w-5 h-5 text-emerald-400" />}
                {editingEmployee ? 'Edit Corporate User' : 'Add New Corporate User'}
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="rounded-full hover:bg-white/20 p-1 text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitEmployee} className="p-6 space-y-4 max-h-[calc(100vh-160px)] overflow-y-auto">
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
                  {editingEmployee ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXPORT RANGE MODAL DIALOG */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsExportModalOpen(false)}></div>
          
          <div className="relative bg-white rounded-xl w-full max-w-md overflow-hidden custom-shadow border border-outline-variant/50 animate-bounce-short text-on-surface">
            <div className="bg-primary p-4 text-on-primary flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Download className="w-5 h-5 text-emerald-400" />
                <span>Export Attendance Report</span>
              </h3>
              <button onClick={() => setIsExportModalOpen(false)} className="rounded-full hover:bg-white/20 p-1 text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleExportCSV(exportStartDate, exportEndDate);
              }} 
              className="p-6 space-y-4"
            >
              <p className="text-xs font-semibold text-on-surface-variant">
                Select the date range to export the daywise attendance report with times for all users.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-4 py-2 border border-outline-variant rounded-lg text-sm font-semibold hover:bg-surface-container-low cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleExportCSV(exportStartDate, exportEndDate)}
                  className="px-4 py-2 border border-primary text-primary rounded-lg text-sm font-semibold hover:bg-primary/5 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportOverallPDF(exportStartDate, exportEndDate)}
                  className="px-5 py-2 bg-primary text-on-primary rounded-lg text-sm font-semibold hover:brightness-110 shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>Download PDF</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXPORT PROFILE RANGE MODAL DIALOG */}
      {isProfileExportModalOpen && selectedEmployeeForProfile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsProfileExportModalOpen(false)}></div>
          
          <div className="relative bg-white rounded-xl w-full max-w-md overflow-hidden custom-shadow border border-outline-variant/50 animate-bounce-short text-on-surface">
            <div className="bg-primary p-4 text-on-primary flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Download className="w-5 h-5 text-emerald-400" />
                <span>Export Profile Report</span>
              </h3>
              <button onClick={() => setIsProfileExportModalOpen(false)} className="rounded-full hover:bg-white/20 p-1 text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleExportProfileCSV(selectedEmployeeForProfile, exportStartDate, exportEndDate);
              }} 
              className="p-6 space-y-4"
            >
              <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant/30 text-xs">
                <p className="font-bold text-primary mb-1">Employee: {selectedEmployeeForProfile.name}</p>
                <p className="text-on-surface-variant">ID: {selectedEmployeeForProfile.empId} | Role: {selectedEmployeeForProfile.role}</p>
              </div>

              <p className="text-xs font-semibold text-on-surface-variant">
                Select the date range to export the daywise attendance report with times for this user.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsProfileExportModalOpen(false)}
                  className="px-4 py-2 border border-outline-variant rounded-lg text-sm font-semibold hover:bg-surface-container-low cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleExportProfileCSV(selectedEmployeeForProfile, exportStartDate, exportEndDate)}
                  className="px-4 py-2 border border-primary text-primary rounded-lg text-sm font-semibold hover:bg-primary/5 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportProfilePDF(selectedEmployeeForProfile, exportStartDate, exportEndDate)}
                  className="px-5 py-2 bg-primary text-on-primary rounded-lg text-sm font-semibold hover:brightness-110 shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>Download PDF</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
