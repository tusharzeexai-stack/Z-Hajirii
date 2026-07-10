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
  Calendar,
  Settings,
  ListTodo,
  CheckSquare,
  Paperclip,
  CheckCircle,
  XCircle,
  Shield,
  Phone,
  Bookmark,
  CalendarClock,
  Award,
  MessageSquare
} from 'lucide-react';
import bcrypt from 'bcryptjs';

import {
  Employee,
  AttendanceRecord,
  ViewTab,
  UserRecord,
  TaskRecord,
  LeaveRequestRecord,
  NotificationRecord,
  AuditLogRecord,
  ChatMessageRecord
} from './types';
import { INITIAL_EMPLOYEES, INITIAL_ATTENDANCE_LOGS } from './data';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { supabase } from './supabaseClient';

// @ts-ignore
import logoUrl from '@/assets/Zeex-AI logo .png';

// Helper to get local date and time string formatted for datetime-local input
const getDefaultDeadlineString = () => {
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  return (new Date(Date.now() - tzoffset)).toISOString().slice(0, 16);
};

// Helper to format deadline nicely
const formatDeadline = (deadlineStr: string) => {
  if (!deadlineStr) return '';
  try {
    const date = new Date(deadlineStr);
    if (isNaN(date.getTime())) return deadlineStr;
    const hasTime = deadlineStr.includes('T') || (deadlineStr.includes(' ') && deadlineStr.split(' ')[1]?.match(/\d/));
    if (hasTime) {
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } else {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  } catch (e) {
    return deadlineStr;
  }
};

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

// Helper to extract remark from serialized total hours
const getRemark = (totalHoursStr: string): string => {
  if (!totalHoursStr) return '';
  const parts = totalHoursStr.split('|');
  return parts.length >= 3 ? parts[2] : '';
};

// Helper to extract extra working minutes from serialized total hours
const getExtraHoursMinutes = (totalHoursStr: string): number => {
  if (!totalHoursStr) return 0;
  const parts = totalHoursStr.split('|');
  if (parts.length < 4) return 0;
  const extraMins = parseInt(parts[3], 10);
  return isNaN(extraMins) ? 0 : extraMins;
};

// Helper to format extra working minutes as string
const getExtraHoursStr = (totalHoursStr: string): string => {
  const extraMins = getExtraHoursMinutes(totalHoursStr);
  if (extraMins === 0) return '0h 00m';
  const hrs = Math.floor(extraMins / 60);
  const mins = extraMins % 60;
  return `${hrs}h ${mins.toString().padStart(2, '0')}m`;
};

// Helper to extract break allowance minutes from serialized total hours
const getBreakAllowanceMinutes = (totalHoursStr: string): number => {
  if (!totalHoursStr) return 0;
  const parts = totalHoursStr.split('|');
  if (parts.length < 5) return 0;
  const allowance = parseInt(parts[4], 10);
  return isNaN(allowance) ? 0 : allowance;
};

// Helper to calculate productive hours (total duration minus break and minus break allowance plus extra hours)
const getProductiveHoursStr = (totalHoursStr: string): string => {
  if (!totalHoursStr || totalHoursStr === '--:--') return '0h 00m';
  const rawHoursStr = totalHoursStr.split('|')[0];
  const breakMins = getBreakMinutes(totalHoursStr);
  const breakAllowance = getBreakAllowanceMinutes(totalHoursStr);
  const totalDeductions = breakMins + breakAllowance;
  const extraMins = getExtraHoursMinutes(totalHoursStr);
  if (totalDeductions === 0 && extraMins === 0) return rawHoursStr;

  try {
    const parts = rawHoursStr.match(/(\d+)h\s*(\d+)m/i);
    if (!parts) return rawHoursStr;
    const hours = parseInt(parts[1], 10);
    const minutes = parseInt(parts[2], 10);
    const totalMins = hours * 60 + minutes;
    const productiveMins = Math.max(0, totalMins - totalDeductions + extraMins);
    const prodHours = Math.floor(productiveMins / 60);
    const prodMins = productiveMins % 60;
    return `${prodHours}h ${prodMins.toString().padStart(2, '0')}m`;
  } catch (err) {
    console.error(err);
    return rawHoursStr;
  }
};

// Parse formatted total hours to decimal hours (taking break minutes, break allowance, and extra hours into account)
const parseTotalHoursToDecimal = (totalHoursStr: string): number => {
  if (!totalHoursStr || totalHoursStr === '0h 00m' || totalHoursStr === '--:--') return 0;
  try {
    const rawHoursStr = totalHoursStr.split('|')[0];
    const breakMins = getBreakMinutes(totalHoursStr);
    const breakAllowance = getBreakAllowanceMinutes(totalHoursStr);
    const totalDeductions = breakMins + breakAllowance;
    const extraMins = getExtraHoursMinutes(totalHoursStr);
    const parts = rawHoursStr.match(/(\d+)h\s*(\d+)m/i);
    if (!parts) return 0;
    const hours = parseInt(parts[1], 10);
    const minutes = parseInt(parts[2], 10);
    const totalMins = hours * 60 + minutes;
    const productiveMins = Math.max(0, totalMins - totalDeductions + extraMins);
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

export default function App() {
  const todayDateString = useMemo(() => {
    return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  const todayFullDateString = useMemo(() => {
    return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }, []);

  // Authentication & Session State
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<UserRecord | null>(null);

  // Core Management State
  const [currentTab, setCurrentTab] = useState<ViewTab>('Dashboard');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([]);
  const [selectedEmployeeForProfile, setSelectedEmployeeForProfile] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // New RBAC States
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessageRecord[]>([]);
  const [activeChatUserId, setActiveChatUserId] = useState<string>('');
  const [chatInputMessage, setChatInputMessage] = useState<string>('');

  // Task Form & Filter States
  const [taskSearchTerm, setTaskSearchTerm] = useState<string>('');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<string>('All');
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState<boolean>(false);
  const [newTaskTitle, setNewTaskTitle] = useState<string>('');
  const [newTaskDesc, setNewTaskDesc] = useState<string>('');
  const [newTaskPriority, setNewTaskPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [newTaskDeadline, setNewTaskDeadline] = useState<string>(getDefaultDeadlineString());
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState<string>('');
  const [newTaskAttachment, setNewTaskAttachment] = useState<string>('');

  // Leave Form & Admin Action States
  const [leaveType, setLeaveType] = useState<'Casual' | 'Sick' | 'Emergency' | 'Work From Home'>('Casual');
  const [leaveFromDate, setLeaveFromDate] = useState<string>('');
  const [leaveToDate, setLeaveToDate] = useState<string>('');
  const [leaveReason, setLeaveReason] = useState<string>('');
  const [leaveDesc, setLeaveDesc] = useState<string>('');
  const [leaveAttachment, setLeaveAttachment] = useState<string>('');

  const [isAdminLeaveCommentModalOpen, setIsAdminLeaveCommentModalOpen] = useState<boolean>(false);
  const [selectedLeaveForAdminAction, setSelectedLeaveForAdminAction] = useState<LeaveRequestRecord | null>(null);
  const [adminLeaveActionType, setAdminLeaveActionType] = useState<'Approved' | 'Rejected'>('Approved');
  const [adminLeaveComment, setAdminLeaveComment] = useState<string>('');

  // User CRUD Form States
  const [isUserModalOpen, setIsUserModalOpen] = useState<boolean>(false);

  // Clock Out Work Summary States
  const [isClockOutModalOpen, setIsClockOutModalOpen] = useState<boolean>(false);
  const [clockOutWorkSummary, setClockOutWorkSummary] = useState<string>('');

  // Dashboard Task Done Filters
  const [adminTaskDoneSearch, setAdminTaskDoneSearch] = useState<string>('');
  const [adminTaskDoneDate, setAdminTaskDoneDate] = useState<string>('');
  const [tlTaskDoneSearch, setTlTaskDoneSearch] = useState<string>('');
  const [tlTaskDoneDate, setTlTaskDoneDate] = useState<string>('');

  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [userFormFullName, setUserFormFullName] = useState<string>('');
  const [userFormUsername, setUserFormUsername] = useState<string>('');
  const [userFormEmail, setUserFormEmail] = useState<string>('');
  const [userFormPhone, setUserFormPhone] = useState<string>('');
  const [userFormDesignation, setUserFormDesignation] = useState<string>('');
  const [userFormDepartment, setUserFormDepartment] = useState<string>('');
  const [userFormJoiningDate, setUserFormJoiningDate] = useState<string>('');
  const [userFormRole, setUserFormRole] = useState<'Employee' | 'Admin' | 'Team Leader'>('Employee');
  const [userFormStatus, setUserFormStatus] = useState<'Active' | 'Disabled'>('Active');
  const [userFormPassword, setUserFormPassword] = useState<string>('');
  const [userFormEmployeeId, setUserFormEmployeeId] = useState<string>('');
  const [userFormInternType, setUserFormInternType] = useState<'Online Intern' | 'Offline Intern'>('Online Intern');
  const [userFormManagerId, setUserFormManagerId] = useState<string>('');

  // Password Change Form State
  const [settingsOldPass, setSettingsOldPass] = useState<string>('');
  const [settingsNewPass, setSettingsNewPass] = useState<string>('');
  const [settingsConfirmPass, setSettingsConfirmPass] = useState<string>('');

  // Attendance Log Edit State
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editClockIn, setEditClockIn] = useState<string>('');
  const [editClockOut, setEditClockOut] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'Present' | 'Absent' | 'Late'>('Present');
  const [editRemark, setEditRemark] = useState<string>('');
  const [editExtraHoursHrs, setEditExtraHoursHrs] = useState<number>(0);
  const [editExtraHoursMins, setEditExtraHoursMins] = useState<number>(0);

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

  // DB Sync helper with robust LocalStorage Fallbacks
  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const mapped: UserRecord[] = (data || []).map(u => ({
        id: u.id,
        username: u.username,
        passwordHash: u.password_hash,
        fullName: u.full_name,
        email: u.email,
        employeeId: u.employee_id,
        department: u.department,
        designation: u.designation,
        phoneNumber: u.phone_number || '',
        joiningDate: u.joining_date || '',
        role: u.role,
        status: u.status,
        internType: u.intern_type || 'Online Intern',
        managerId: u.manager_id || null,
        createdAt: u.created_at,
        updatedAt: u.updated_at
      }));
      setUsers(mapped);
      localStorage.setItem('zhajirii_users', JSON.stringify(mapped));
      return mapped;
    } catch (err: any) {
      console.warn('Supabase users fetch failed, falling back to localStorage:', err.message);
      const local = localStorage.getItem('zhajirii_users');
      const parsed = local ? JSON.parse(local) : [];
      setUsers(parsed);
      return parsed;
    }
  };

  const saveUser = async (user: UserRecord) => {
    const dbUser = {
      id: user.id,
      username: user.username,
      password_hash: user.passwordHash,
      full_name: user.fullName,
      email: user.email,
      employee_id: user.employeeId,
      department: user.department,
      designation: user.designation,
      phone_number: user.phoneNumber || '',
      joining_date: user.joiningDate || '',
      role: user.role,
      status: user.status,
      intern_type: user.internType || 'Online Intern',
      manager_id: user.managerId || null
    };

    try {
      const { error } = await supabase.from('users').upsert(dbUser);
      if (error) throw error;
    } catch (err: any) {
      console.warn('Supabase user save failed, writing locally:', err.message);
    }

    const currentUsers = JSON.parse(localStorage.getItem('zhajirii_users') || '[]');
    const index = currentUsers.findIndex((u: any) => u.id === user.id);
    if (index >= 0) {
      currentUsers[index] = user;
    } else {
      currentUsers.push(user);
    }
    setUsers(currentUsers);
    localStorage.setItem('zhajirii_users', JSON.stringify(currentUsers));
  };

  const deleteUser = async (id: string) => {
    try {
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) throw error;
    } catch (err: any) {
      console.warn('Supabase user delete failed, updating local state:', err.message);
    }

    const currentUsers = JSON.parse(localStorage.getItem('zhajirii_users') || '[]');
    const filtered = currentUsers.filter((u: any) => u.id !== id);
    setUsers(filtered);
    localStorage.setItem('zhajirii_users', JSON.stringify(filtered));
  };

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const mapped: TaskRecord[] = (data || []).map(t => ({
        id: t.id,
        userId: t.user_id,
        title: t.title,
        description: t.description || '',
        priority: t.priority,
        deadline: t.deadline,
        status: t.status,
        attachment: t.attachment || '',
        completedAt: t.completed_at,
        createdAt: t.created_at
      }));
      setTasks(mapped);
      localStorage.setItem('zhajirii_tasks', JSON.stringify(mapped));
      return mapped;
    } catch (err: any) {
      console.warn('Supabase tasks fetch failed, falling back to localStorage:', err.message);
      const local = localStorage.getItem('zhajirii_tasks');
      const parsed = local ? JSON.parse(local) : [];
      setTasks(parsed);
      return parsed;
    }
  };

  const saveTask = async (task: TaskRecord) => {
    const dbTask = {
      id: task.id,
      user_id: task.userId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      deadline: task.deadline,
      status: task.status,
      attachment: task.attachment || '',
      completed_at: task.completedAt || null
    };

    try {
      const { error } = await supabase.from('tasks').upsert(dbTask);
      if (error) throw error;
    } catch (err: any) {
      console.warn('Supabase task save failed, updating locally:', err.message);
    }

    const currentTasks = JSON.parse(localStorage.getItem('zhajirii_tasks') || '[]');
    const index = currentTasks.findIndex((t: any) => t.id === task.id);
    if (index >= 0) {
      currentTasks[index] = task;
    } else {
      currentTasks.push(task);
    }
    setTasks(currentTasks);
    localStorage.setItem('zhajirii_tasks', JSON.stringify(currentTasks));
  };

  const deleteTask = async (id: string) => {
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    } catch (err: any) {
      console.warn('Supabase task delete failed, updating locally:', err.message);
    }

    const currentTasks = JSON.parse(localStorage.getItem('zhajirii_tasks') || '[]');
    const filtered = currentTasks.filter((t: any) => t.id !== id);
    setTasks(filtered);
    localStorage.setItem('zhajirii_tasks', JSON.stringify(filtered));
  };

  const fetchChatMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const mapped: ChatMessageRecord[] = (data || []).map((m: any) => ({
        id: m.id,
        senderId: m.sender_id,
        receiverId: m.receiver_id,
        message: m.message,
        createdAt: m.created_at
      }));
      setChatMessages(mapped);
      localStorage.setItem('zhajirii_chat_messages', JSON.stringify(mapped));
      return mapped;
    } catch (err: any) {
      console.warn('Supabase chat fetch failed, falling back to localStorage:', err.message);
      const local = localStorage.getItem('zhajirii_chat_messages');
      const parsed = local ? JSON.parse(local) : [];
      setChatMessages(parsed);
      return parsed;
    }
  };

  const sendChatMessage = async (msg: string, receiverId: string) => {
    if (!currentUser) return;
    const newMsg: ChatMessageRecord = {
      id: crypto.randomUUID(),
      senderId: currentUser.id,
      receiverId,
      message: msg,
      createdAt: new Date().toISOString()
    };

    const dbMsg = {
      id: newMsg.id,
      sender_id: newMsg.senderId,
      receiver_id: newMsg.receiverId,
      message: newMsg.message,
      created_at: newMsg.createdAt
    };

    try {
      const { error } = await supabase.from('chat_messages').insert(dbMsg);
      if (error) throw error;
    } catch (err: any) {
      console.warn('Supabase chat send failed, updating locally:', err.message);
    }

    const currentMsgs = JSON.parse(localStorage.getItem('zhajirii_chat_messages') || '[]');
    currentMsgs.push(newMsg);
    localStorage.setItem('zhajirii_chat_messages', JSON.stringify(currentMsgs));
    setChatMessages(currentMsgs);

    // Trigger notification for message recipient
    await createNotification(
      receiverId,
      'New Message',
      `You received a new message from ${currentUser.fullName}: "${msg.substring(0, 35)}${msg.length > 35 ? '...' : ''}"`,
      'System'
    );
  };

  const fetchLeaveRequests = async () => {
    try {
      const { data, error } = await supabase.from('leave_requests').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const mapped: LeaveRequestRecord[] = (data || []).map(l => ({
        id: l.id,
        userId: l.user_id,
        leaveType: l.leave_type,
        fromDate: l.from_date,
        toDate: l.to_date,
        totalDays: l.total_days,
        reason: l.reason,
        description: l.description || '',
        attachment: l.attachment || '',
        status: l.status,
        adminComment: l.admin_comment || '',
        approvedBy: l.approved_by || null,
        approvedAt: l.approved_at || undefined,
        createdAt: l.created_at
      }));
      setLeaveRequests(mapped);
      localStorage.setItem('zhajirii_leaves', JSON.stringify(mapped));
      return mapped;
    } catch (err: any) {
      console.warn('Supabase leaves fetch failed, falling back to localStorage:', err.message);
      const local = localStorage.getItem('zhajirii_leaves');
      const parsed = local ? JSON.parse(local) : [];
      setLeaveRequests(parsed);
      return parsed;
    }
  };

  const saveLeaveRequest = async (leave: LeaveRequestRecord) => {
    const dbLeave = {
      id: leave.id,
      user_id: leave.userId,
      leave_type: leave.leaveType,
      from_date: leave.fromDate,
      to_date: leave.toDate,
      total_days: leave.totalDays,
      reason: leave.reason,
      description: leave.description || '',
      attachment: leave.attachment || '',
      status: leave.status,
      admin_comment: leave.adminComment || '',
      approved_by: leave.approvedBy || null,
      approved_at: leave.approvedAt || null
    };

    try {
      const { error } = await supabase.from('leave_requests').upsert(dbLeave);
      if (error) throw error;
    } catch (err: any) {
      console.warn('Supabase leave request save failed, updating locally:', err.message);
    }

    const currentLeaves = JSON.parse(localStorage.getItem('zhajirii_leaves') || '[]');
    const index = currentLeaves.findIndex((l: any) => l.id === leave.id);
    if (index >= 0) {
      currentLeaves[index] = leave;
    } else {
      currentLeaves.push(leave);
    }
    setLeaveRequests(currentLeaves);
    localStorage.setItem('zhajirii_leaves', JSON.stringify(currentLeaves));
  };

  const deleteLeaveRequest = async (id: string) => {
    try {
      const { error } = await supabase.from('leave_requests').delete().eq('id', id);
      if (error) throw error;
    } catch (err: any) {
      console.warn('Supabase leave request delete failed, updating locally:', err.message);
    }

    const currentLeaves = JSON.parse(localStorage.getItem('zhajirii_leaves') || '[]');
    const filtered = currentLeaves.filter((l: any) => l.id !== id);
    setLeaveRequests(filtered);
    localStorage.setItem('zhajirii_leaves', JSON.stringify(filtered));
  };

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const mapped: NotificationRecord[] = (data || []).map(n => ({
        id: n.id,
        userId: n.user_id,
        title: n.title,
        message: n.message,
        type: n.type,
        isRead: n.is_read,
        createdAt: n.created_at
      }));
      setNotifications(mapped);
      localStorage.setItem('zhajirii_notifications', JSON.stringify(mapped));
      return mapped;
    } catch (err: any) {
      console.warn('Supabase notifications fetch failed, falling back to localStorage:', err.message);
      const local = localStorage.getItem('zhajirii_notifications');
      const parsed = local ? JSON.parse(local) : [];
      setNotifications(parsed);
      return parsed;
    }
  };

  const createNotification = async (userId: string, title: string, message: string, type: 'Task' | 'Leave' | 'System') => {
    const notif: NotificationRecord = {
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId,
      title,
      message,
      type,
      isRead: false,
      createdAt: new Date().toISOString()
    };

    const dbNotif = {
      id: notif.id,
      user_id: notif.userId,
      title: notif.title,
      message: notif.message,
      type: notif.type,
      is_read: notif.isRead
    };

    try {
      const { error } = await supabase.from('notifications').insert(dbNotif);
      if (error) throw error;
    } catch (err: any) {
      console.warn('Supabase notification insert failed, storing locally:', err.message);
    }

    const currentNotifs = JSON.parse(localStorage.getItem('zhajirii_notifications') || '[]');
    currentNotifs.unshift(notif);
    setNotifications(currentNotifs);
    localStorage.setItem('zhajirii_notifications', JSON.stringify(currentNotifs));

    if (currentUser && currentUser.id === userId) {
      showToast(`${title}: ${message}`);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      if (error) throw error;
    } catch (err: any) {
      console.warn('Supabase notification update failed:', err.message);
    }

    const currentNotifs = [...notifications];
    const idx = currentNotifs.findIndex(n => n.id === id);
    if (idx >= 0) {
      currentNotifs[idx].isRead = true;
      setNotifications(currentNotifs);
      localStorage.setItem('zhajirii_notifications', JSON.stringify(currentNotifs));
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!currentUser) return;
    try {
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id);
      if (error) throw error;
    } catch (err: any) {
      console.warn('Supabase mark all read failed:', err.message);
    }

    const updated = notifications.map(n => ({ ...n, isRead: true }));
    setNotifications(updated);
    localStorage.setItem('zhajirii_notifications', JSON.stringify(updated));
    showToast('All notifications marked as read.');
  };

  const handleClearNotifications = async () => {
    if (!currentUser) return;
    try {
      const { error } = await supabase.from('notifications').delete().eq('user_id', currentUser.id);
      if (error) throw error;
    } catch (err: any) {
      console.warn('Supabase clear notifications failed:', err.message);
    }

    setNotifications([]);
    localStorage.setItem('zhajirii_notifications', JSON.stringify([]));
    showToast('All notifications cleared.');
  };

  const fetchAuditLogs = async () => {
    try {
      const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const mapped: AuditLogRecord[] = (data || []).map(a => ({
        id: a.id,
        userId: a.user_id,
        username: a.username || '',
        action: a.action,
        details: a.details,
        ipAddress: a.ip_address || '',
        createdAt: a.created_at
      }));
      setAuditLogs(mapped);
      localStorage.setItem('zhajirii_audit_logs', JSON.stringify(mapped));
      return mapped;
    } catch (err: any) {
      console.warn('Supabase audit logs fetch failed, loading locally:', err.message);
      const local = localStorage.getItem('zhajirii_audit_logs');
      const parsed = local ? JSON.parse(local) : [];
      setAuditLogs(parsed);
      return parsed;
    }
  };

  const createAuditLog = async (userId: string | null, userStr: string, action: string, details: string) => {
    const log: AuditLogRecord = {
      id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId,
      username: userStr,
      action,
      details,
      createdAt: new Date().toISOString()
    };

    const dbLog = {
      id: log.id,
      user_id: log.userId,
      username: log.username,
      action: log.action,
      details: log.details
    };

    try {
      const { error } = await supabase.from('audit_logs').insert(dbLog);
      if (error) throw error;
    } catch (err: any) {
      console.warn('Supabase audit log insert failed:', err.message);
    }

    const currentLogs = JSON.parse(localStorage.getItem('zhajirii_audit_logs') || '[]');
    currentLogs.unshift(log);
    setAuditLogs(currentLogs);
    localStorage.setItem('zhajirii_audit_logs', JSON.stringify(currentLogs));
  };

  // Seed default Admin user if users table is empty
  const checkAndSeedAdmin = async (currentUsers: UserRecord[], currentEmployees: Employee[]) => {
    if (currentUsers.length === 0) {
      console.log('No users found. Seeding default Admin user...');
      const defaultAdmin: UserRecord = {
        id: 'usr-admin',
        username: 'Z-Hajirii',
        passwordHash: bcrypt.hashSync('Admin@Hajirii', 10),
        fullName: 'Admin User',
        email: 'admin@zhajirii.com',
        employeeId: 'emp-admin',
        department: 'Management',
        designation: 'System Manager',
        phoneNumber: '123-456-7890',
        joiningDate: '2026-01-01',
        role: 'Admin',
        status: 'Active',
        internType: 'Online Intern'
      };

      const dbEmp = {
        id: 'emp-admin',
        name: 'Admin User',
        role: 'System Manager',
        email: 'admin@zhajirii.com',
        avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150',
        emp_id: 'EMP-ADMIN',
        active_now: true
      };

      try {
        await supabase.from('employees').upsert(dbEmp);
      } catch (e) {
        console.warn('Could not seed admin employee to Supabase:', e);
      }

      await saveUser(defaultAdmin);
      await createNotification(
        'usr-admin',
        'Welcome to Z-Hajirii',
        'Your administrative account has been successfully initialized.',
        'System'
      );
      await createAuditLog('usr-admin', 'Z-Hajirii', 'System Initialization', 'Seeded default administrator account.');
    }

    // Clean up/prune mock users from database and local storage if present
    try {
      await supabase.from('users').delete().in('id', ['usr-online', 'usr-offline', 'usr-manager']);
      await supabase.from('employees').delete().in('id', ['emp-online', 'emp-offline', 'emp-manager']);
    } catch (e) {
      console.warn('Could not prune mock users from database:', e);
    }

    const localUsersStr = localStorage.getItem('zhajirii_users');
    if (localUsersStr) {
      const localUsers = JSON.parse(localUsersStr);
      const filtered = localUsers.filter((u: any) => u.id !== 'usr-online' && u.id !== 'usr-offline' && u.id !== 'usr-manager');
      if (filtered.length !== localUsers.length) {
        localStorage.setItem('zhajirii_users', JSON.stringify(filtered));
      }
    }

    // Auto-create user records for any employees who don't have a linked user account yet.
    // Default them to Offline Interns so the admin can edit them.
    let seededNewUsers = false;
    for (const emp of currentEmployees) {
      const userExists = currentUsers.some(u => u.employeeId === emp.id);
      if (!userExists) {
        console.log(`Auto-seeding user account for employee ${emp.name}`);
        const usernameBase = emp.name.toLowerCase().trim().replace(/\s+/g, '_');
        const defaultUser: UserRecord = {
          id: `usr-${emp.id}`,
          username: usernameBase,
          passwordHash: bcrypt.hashSync('Pass@123', 10),
          fullName: emp.name,
          email: emp.email || `${usernameBase}@company.com`,
          employeeId: emp.id,
          department: 'Engineering',
          designation: emp.role || 'Offline Intern',
          phoneNumber: '',
          joiningDate: new Date().toISOString().split('T')[0],
          role: 'Employee',
          status: 'Active',
          internType: 'Offline Intern'
        };
        try {
          await saveUser(defaultUser);
          await createNotification(
            defaultUser.id,
            'Profile Created',
            `Your account has been seeded. Username: ${defaultUser.username}, Password: Pass@123`,
            'System'
          );
          seededNewUsers = true;
        } catch (e) {
          console.warn(`Could not seed user account for employee ${emp.name}:`, e);
        }
      }
    }

    if (seededNewUsers) {
      await fetchUsers();
    }
  };

  // Main fetch data flow
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

      // Fetch new modules
      const fetchedUsers = await fetchUsers();
      await fetchTasks();
      await fetchLeaveRequests();
      await fetchNotifications();
      await fetchAuditLogs();
      await fetchChatMessages();

      // Seed if empty
      await checkAndSeedAdmin(fetchedUsers, mappedEmployees);

      // Select first employee for profile if none selected
      if (mappedEmployees.length > 0) {
        setSelectedEmployeeForProfile(prev => {
          if (prev) {
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
      // Fallback local load for employees and logs
      const localEmps = localStorage.getItem('zhajirii_employees');
      const localLogs = localStorage.getItem('zhajirii_logs');
      if (localEmps) setEmployees(JSON.parse(localEmps));
      if (localLogs) setAttendanceLogs(JSON.parse(localLogs));

      showToast('Offline Mode: Loaded cached information.');
    } finally {
      setLoading(false);
    }
  };

  // Persistent Session Loader
  useEffect(() => {
    const savedSession = localStorage.getItem('zhajirii_session');
    if (savedSession) {
      try {
        const u: UserRecord = JSON.parse(savedSession);
        setCurrentUser(u);
        setIsLoggedIn(true);
        setCurrentTab(u.role === 'Admin' ? 'Dashboard' : 'EmpDashboard');
      } catch (e) {
        console.error('Failed to restore session:', e);
      }
    }
    fetchData();
  }, []);

  // Update localStorage caches whenever employees or logs change
  useEffect(() => {
    if (employees.length > 0) {
      localStorage.setItem('zhajirii_employees', JSON.stringify(employees));
    }
  }, [employees]);

  useEffect(() => {
    if (attendanceLogs.length > 0) {
      localStorage.setItem('zhajirii_logs', JSON.stringify(attendanceLogs));
    }
  }, [attendanceLogs]);

  // Update selected employee when role tab changes
  useEffect(() => {
    if (currentUser && currentUser.role !== 'Admin') {
      const match = employees.find(e => e.id === currentUser.employeeId);
      if (match) {
        setSelectedEmployeeForProfile(match);
      }
    }
  }, [currentUser, employees]);

  // Chat messages polling loop (runs every 3 seconds)
  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(() => {
      fetchChatMessages();
      fetchNotifications();
    }, 3000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');

    // Fetch latest users to verify against
    const currentUsers = await fetchUsers();

    // Try finding user by username case-insensitive
    const user = currentUsers.find(
      u => u.username.trim().toLowerCase() === username.trim().toLowerCase()
    );

    if (user) {
      if (user.status === 'Disabled') {
        setLoginError('Account is disabled. Please contact your administrator.');
        return;
      }

      const passMatch = bcrypt.compareSync(password, user.passwordHash);
      if (passMatch) {
        setCurrentUser(user);
        setIsLoggedIn(true);
        setLoginError('');
        if (rememberMe) {
          localStorage.setItem('zhajirii_session', JSON.stringify(user));
        }
        setCurrentTab(user.role === 'Admin' ? 'Dashboard' : 'EmpDashboard');
        showToast(`Successfully logged in as ${user.fullName}`);
        createAuditLog(user.id, user.username, 'Login', 'User successfully authenticated.');
      } else {
        setLoginError('Invalid username or password.');
      }
    } else {
      // Fallback emergency seed checker
      if (username.trim() === 'Z-Hajirii' && password === 'Admin@Hajirii') {
        // Table must be empty or missing connection. Seed Admin and log in.
        const defaultAdmin: UserRecord = {
          id: 'usr-admin',
          username: 'Z-Hajirii',
          passwordHash: bcrypt.hashSync('Admin@Hajirii', 10),
          fullName: 'Admin User',
          email: 'admin@zhajirii.com',
          employeeId: 'emp-admin',
          department: 'Management',
          designation: 'System Manager',
          phoneNumber: '123-456-7890',
          joiningDate: '2026-01-01',
          role: 'Admin',
          status: 'Active'
        };
        await saveUser(defaultAdmin);
        setCurrentUser(defaultAdmin);
        setIsLoggedIn(true);
        setCurrentTab('Dashboard');
        showToast('Successfully logged in (Emergency Seed Admin).');
      } else {
        setLoginError('Invalid username or password.');
      }
    }
  };

  const handleLogout = () => {
    if (currentUser) {
      createAuditLog(currentUser.id, currentUser.username, 'Logout', 'User signed out.');
    }
    setCurrentUser(null);
    setIsLoggedIn(false);
    localStorage.removeItem('zhajirii_session');
    setUsername('');
    setPassword('');
    showToast('Logged out successfully.');
  };

  // Change Password logic
  const handleChangePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!settingsOldPass || !settingsNewPass || !settingsConfirmPass) {
      showToast('Please fill in all password fields.');
      return;
    }

    if (settingsNewPass !== settingsConfirmPass) {
      showToast('New passwords do not match.');
      return;
    }

    // Verify old password
    const verify = bcrypt.compareSync(settingsOldPass, currentUser.passwordHash);
    if (!verify) {
      showToast('Incorrect old password.');
      return;
    }

    const updatedUser: UserRecord = {
      ...currentUser,
      passwordHash: bcrypt.hashSync(settingsNewPass, 10),
      updatedAt: new Date().toISOString()
    };

    await saveUser(updatedUser);
    setCurrentUser(updatedUser);
    localStorage.setItem('zhajirii_session', JSON.stringify(updatedUser));

    setSettingsOldPass('');
    setSettingsNewPass('');
    setSettingsConfirmPass('');
    showToast('Password updated successfully!');
    createAuditLog(currentUser.id, currentUser.username, 'Password Change', 'User successfully changed their password.');
  };

  // Create or Update User flow (Admin action)
  const handleUserCRUDSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (
      !userFormFullName.trim() ||
      !userFormUsername.trim() ||
      !userFormEmail.trim() ||
      !userFormDesignation.trim() ||
      !userFormDepartment.trim() ||
      !userFormEmployeeId.trim()
    ) {
      showToast('Please fill in all required fields.');
      return;
    }

    // Check duplicate username (except for current editing user)
    const duplicate = users.find(
      u =>
        u.username.toLowerCase() === userFormUsername.trim().toLowerCase() &&
        (!editingUser || u.id !== editingUser.id)
    );
    if (duplicate) {
      showToast('Username already exists. Please choose another.');
      return;
    }

    const targetEmpIdStr = `emp-${Date.now()}`;
    const employeeIdToUse = editingUser ? (editingUser.employeeId || targetEmpIdStr) : targetEmpIdStr;

    // 1. Sync / Save to Employees table
    const avatar = `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 999999)}?auto=format&fit=crop&q=80&w=150`;
    const dbEmp = {
      id: employeeIdToUse,
      name: userFormFullName.trim(),
      role: userFormDesignation.trim(),
      email: userFormEmail.trim(),
      avatar_url: avatar,
      emp_id: userFormEmployeeId.trim().toUpperCase(),
      active_now: userFormStatus === 'Active'
    };

    try {
      const { error } = await supabase.from('employees').upsert(dbEmp);
      if (error) throw error;
    } catch (e) {
      console.warn('Failed to sync employee record:', e);
    }

    // 2. Hash and Save User
    let passHash = editingUser ? editingUser.passwordHash : bcrypt.hashSync('Pass@123', 10);
    if (userFormPassword.trim()) {
      passHash = bcrypt.hashSync(userFormPassword.trim(), 10);
    }

    const targetUserId = editingUser ? editingUser.id : `usr-${Date.now()}`;
    const userToSave: UserRecord = {
      id: targetUserId,
      username: userFormUsername.trim(),
      passwordHash: passHash,
      fullName: userFormFullName.trim(),
      email: userFormEmail.trim(),
      employeeId: employeeIdToUse,
      department: userFormDepartment.trim(),
      designation: userFormDesignation.trim(),
      phoneNumber: userFormPhone.trim(),
      joiningDate: userFormJoiningDate,
      role: userFormRole,
      status: userFormStatus,
      internType: userFormInternType,
      managerId: userFormRole === 'Employee' && userFormManagerId ? userFormManagerId : null,
      updatedAt: new Date().toISOString()
    };

    await saveUser(userToSave);

    // Write logs & notifications
    if (editingUser) {
      showToast(`User ${userToSave.fullName} updated successfully.`);
      createAuditLog(
        currentUser?.id || null,
        currentUser?.username || 'Admin',
        'Edit User',
        `Updated user account: ${userToSave.username}`
      );
    } else {
      showToast(`Created user ${userToSave.fullName} successfully. Default password is Pass@123`);
      createAuditLog(
        currentUser?.id || null,
        currentUser?.username || 'Admin',
        'Create User',
        `Created new user account: ${userToSave.username}`
      );
      await createNotification(
        userToSave.id,
        'Welcome to Z-Hajirii!',
        `Your user profile has been created. Role: ${userFormRole}.`,
        'System'
      );
    }

    // Reset Form
    setIsUserModalOpen(false);
    setEditingUser(null);
    setUserFormFullName('');
    setUserFormUsername('');
    setUserFormEmail('');
    setUserFormPhone('');
    setUserFormDesignation('');
    setUserFormDepartment('');
    setUserFormJoiningDate('');
    setUserFormRole('Employee');
    setUserFormStatus('Active');
    setUserFormPassword('');
    setUserFormEmployeeId('');
    setUserFormInternType('Online Intern');
    setUserFormManagerId('');

    await fetchData();
  };

  // Delete user flow
  const handleDeleteUserFlow = async (userId: string, userName: string, empId: string | null) => {
    if (window.confirm(`Are you sure you want to permanently delete user ${userName}?`)) {
      if (empId) {
        try {
          await supabase.from('attendance_logs').delete().eq('employee_id', empId);
          await supabase.from('employees').delete().eq('id', empId);
        } catch (e) {
          console.warn('Failed to delete linked employee/attendance records:', e);
        }
      }

      await deleteUser(userId);
      showToast(`Permanently deleted user account ${userName}.`);
      createAuditLog(
        currentUser?.id || null,
        currentUser?.username || 'Admin',
        'Delete User',
        `Deleted user account and records: ${userName}`
      );
      await fetchData();
    }
  };

  // Promote User to Team Leader flow
  const handlePromoteToTeamLeader = async (user: UserRecord) => {
    if (window.confirm(`Are you sure you want to promote ${user.fullName} to Team Leader?`)) {
      const updatedUser: UserRecord = {
        ...user,
        role: 'Team Leader',
        updatedAt: new Date().toISOString()
      };

      await saveUser(updatedUser);
      showToast(`${user.fullName} has been successfully promoted to Team Leader!`);

      createAuditLog(
        currentUser?.id || null,
        currentUser?.username || 'Admin',
        'Promote User',
        `Promoted user ${user.username} to Team Leader`
      );

      await createNotification(
        user.id,
        'Promotion Announcement',
        `Congratulations! You have been promoted to Team Leader.`,
        'System'
      );
      await fetchData();
    }
  };

  // Disable / Enable User status toggle
  const handleToggleUserStatus = async (user: UserRecord) => {
    const nextStatus: 'Active' | 'Disabled' = user.status === 'Active' ? 'Disabled' : 'Active';
    const updated: UserRecord = {
      ...user,
      status: nextStatus,
      updatedAt: new Date().toISOString()
    };

    await saveUser(updated);
    showToast(`Account status for ${user.fullName} updated to ${nextStatus}.`);
    createAuditLog(
      currentUser?.id || null,
      currentUser?.username || 'Admin',
      'Toggle User Status',
      `Toggled status for ${user.username} to ${nextStatus}`
    );
    await fetchData();
  };

  // Task creation/update submit
  const handleTaskSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) {
      showToast('Please enter a task title.');
      return;
    }

    const assigneeId = newTaskAssigneeId || (currentUser ? currentUser.id : '');
    const assigneeUser = users.find(u => u.id === assigneeId);

    const task: TaskRecord = {
      id: `task-${Date.now()}`,
      userId: assigneeId,
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
      priority: newTaskPriority,
      deadline: newTaskDeadline || getDefaultDeadlineString(),
      status: 'Pending',
      attachment: newTaskAttachment.trim(),
      createdAt: new Date().toISOString()
    };

    await saveTask(task);
    showToast(`Task assigned successfully.`);
    setIsAddTaskModalOpen(false);

    // Notify assignee if not self-assigned
    if (currentUser && currentUser.id !== assigneeId) {
      await createNotification(
        assigneeId,
        'New Task Assigned',
        `You have been assigned a new task: "${task.title}" by ${currentUser.fullName}`,
        'Task'
      );
    }

    createAuditLog(
      currentUser?.id || null,
      currentUser?.username || 'System',
      'Assign Task',
      `Assigned task "${task.title}" to ${assigneeUser ? assigneeUser.username : 'self'}`
    );

    // Reset form
    setNewTaskTitle('');
    setNewTaskDesc('');
    setNewTaskPriority('Medium');
    setNewTaskDeadline('');
    setNewTaskAssigneeId('');
    setNewTaskAttachment('');

    await fetchData();
  };

  // Transition task status
  const handleUpdateTaskStatus = async (task: TaskRecord, nextStatus: 'Pending' | 'In Progress' | 'Completed') => {
    const updated: TaskRecord = {
      ...task,
      status: nextStatus,
      completedAt: nextStatus === 'Completed' ? new Date().toISOString() : undefined
    };

    await saveTask(updated);
    showToast(`Task status updated to ${nextStatus}.`);

    // Notify admin/managers of completion
    if (nextStatus === 'Completed') {
      const admins = users.filter(u => u.role === 'Admin');
      admins.forEach(async adm => {
        if (adm.id !== task.userId) {
          await createNotification(
            adm.id,
            'Task Completed',
            `User ${currentUser?.fullName || 'Employee'} completed task: "${task.title}"`,
            'Task'
          );
        }
      });
    }

    createAuditLog(
      currentUser?.id || null,
      currentUser?.username || 'System',
      'Update Task Status',
      `Updated task "${task.title}" status to ${nextStatus}`
    );

    await fetchData();
  };

  // Submit leave request (Employee action)
  const handleLeaveRequestSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!leaveFromDate || !leaveToDate || !leaveReason.trim()) {
      showToast('Please fill in leave dates and reason.');
      return;
    }

    const start = new Date(leaveFromDate);
    const end = new Date(leaveToDate);
    if (start > end) {
      showToast('From Date cannot be after To Date.');
      return;
    }

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (!currentUser) return;

    const request: LeaveRequestRecord = {
      id: `leave-${Date.now()}`,
      userId: currentUser.id,
      leaveType,
      fromDate: leaveFromDate,
      toDate: leaveToDate,
      totalDays,
      reason: leaveReason.trim(),
      description: leaveDesc.trim(),
      attachment: leaveAttachment.trim(),
      status: 'Pending',
      createdAt: new Date().toISOString()
    };

    await saveLeaveRequest(request);
    showToast(`Leave request submitted for ${totalDays} days.`);

    // Notify Admins
    const admins = users.filter(u => u.role === 'Admin');
    admins.forEach(async adm => {
      await createNotification(
        adm.id,
        'New Leave Application',
        `${currentUser.fullName} applied for ${totalDays} days of ${leaveType} leave.`,
        'Leave'
      );
    });

    createAuditLog(
      currentUser.id,
      currentUser.username,
      'Apply Leave',
      `Applied for ${totalDays} days of ${leaveType} leave starting ${leaveFromDate}`
    );

    // Reset Form
    setLeaveFromDate('');
    setLeaveToDate('');
    setLeaveReason('');
    setLeaveDesc('');
    setLeaveAttachment('');

    await fetchData();
  };

  // Approve / Reject Leave Request (Admin action)
  const handleAdminLeaveDecisionSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedLeaveForAdminAction || !currentUser) return;

    const updated: LeaveRequestRecord = {
      ...selectedLeaveForAdminAction,
      status: adminLeaveActionType,
      adminComment: adminLeaveComment.trim(),
      approvedBy: currentUser.id,
      approvedAt: new Date().toISOString()
    };

    await saveLeaveRequest(updated);
    showToast(`Leave request marked as ${adminLeaveActionType}.`);

    // Notify employee
    const applicant = users.find(u => u.id === selectedLeaveForAdminAction.userId);
    if (applicant) {
      await createNotification(
        applicant.id,
        `Leave Request ${adminLeaveActionType}`,
        `Your request for ${selectedLeaveForAdminAction.leaveType} leave has been ${adminLeaveActionType.toLowerCase()}. Comment: ${adminLeaveComment.trim() || 'None'}`,
        'Leave'
      );
    }

    createAuditLog(
      currentUser.id,
      currentUser.username,
      `${adminLeaveActionType} Leave`,
      `Marked leave request ${selectedLeaveForAdminAction.id} as ${adminLeaveActionType}`
    );

    setIsAdminLeaveCommentModalOpen(false);
    setSelectedLeaveForAdminAction(null);
    setAdminLeaveComment('');

    await fetchData();
  };

  // Clock In/Out on Employee Dashboard
  const handleEmployeeClockToggle = async () => {
    if (!currentUser || !currentUser.employeeId) return;

    const empId = currentUser.employeeId;
    const existingLog = attendanceLogs.find(log => log.employeeId === empId && log.date === todayDateString);

    if (!existingLog) {
      // Clock In
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const minsLate = calculateMinutesLate(timeStr);
      const autoStatus = minsLate > 0 ? 'Late' : 'Present';

      const dbLog = {
        id: `rec-${Date.now()}`,
        employee_id: empId,
        date: todayDateString,
        clock_in: timeStr,
        clock_out: '--:--',
        total_hours: '0h 00m',
        status: autoStatus
      };

      try {
        const { error } = await supabase.from('attendance_logs').insert(dbLog);
        if (error) throw error;
        showToast('Successfully clocked in.');
        createAuditLog(currentUser.id, currentUser.username, 'Clock In', `Clocked in at ${timeStr}`);
        await fetchData();
      } catch (err) {
        console.error(err);
        showToast('Failed to Clock In.');
      }
    } else if (existingLog.clockOut === '--:--') {
      // Clock Out - open modal to prompt for work description
      setClockOutWorkSummary('');
      setIsClockOutModalOpen(true);
    } else {
      showToast('You have already clocked in and out for today.');
    }
  };

  // Submit Work Summary & Perform Clock Out
  const handleClockOutSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clockOutWorkSummary.trim()) {
      showToast('Please describe what work you have done today.');
      return;
    }
    if (!currentUser || !currentUser.employeeId) return;

    const empId = currentUser.employeeId;
    const existingLog = attendanceLogs.find(log => log.employeeId === empId && log.date === todayDateString);
    if (!existingLog) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const totalHours = calculateDuration(existingLog.clockIn, timeStr);

    const breakMins = getBreakMinutes(existingLog.totalHours);
    const existingExtraMins = getExtraHoursMinutes(existingLog.totalHours);
    const existingAllowance = getBreakAllowanceMinutes(existingLog.totalHours);
    const serializedTotalHours = `${totalHours}|${breakMins}|${clockOutWorkSummary.trim()}|${existingExtraMins}|${existingAllowance}`;

    try {
      // 1. Clock out in attendance logs
      const { error: clockOutError } = await supabase
        .from('attendance_logs')
        .update({
          clock_out: timeStr,
          total_hours: serializedTotalHours
        })
        .eq('id', existingLog.id);

      if (clockOutError) throw clockOutError;

      // 2. Create task representing this daily work done
      const task: TaskRecord = {
        id: `task-${Date.now()}`,
        userId: currentUser.id,
        title: `Work Done - ${todayDateString}`,
        description: clockOutWorkSummary.trim(),
        priority: 'Medium',
        deadline: new Date().toISOString().slice(0, 16),
        status: 'Completed',
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      await saveTask(task);

      showToast('Successfully clocked out and work summary saved.');
      createAuditLog(currentUser.id, currentUser.username, 'Clock Out', `Clocked out at ${timeStr}. Completed task details: ${clockOutWorkSummary.trim()}`);
      
      // Reset state and close modal
      setIsClockOutModalOpen(false);
      setClockOutWorkSummary('');
      await fetchData();
    } catch (err) {
      console.error(err);
      showToast('Failed to Clock Out.');
    }
  };

  // Change individual attendance record status (Admin overrides)
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

      showToast(`Successfully marked attendance as ${finalStatus}`);
      createAuditLog(
        currentUser?.id || null,
        currentUser?.username || 'Admin',
        'Override Attendance',
        `Set attendance for employee ${employeeId} to ${finalStatus} on ${dateString}`
      );
      await fetchData();
    } catch (err) {
      console.error(err);
      showToast('Failed to update status.');
    }
  };

  // Clock out worker override (Admin action)
  const handleClockOut = async (employeeId: string, dateString = todayDateString) => {
    const existingLog = attendanceLogs.find(log => log.employeeId === employeeId && log.date === dateString);
    if (!existingLog) {
      showToast('No clock in log registered for today.');
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const duration = calculateDuration(existingLog.clockIn, timeStr);

    try {
      const { error } = await supabase
        .from('attendance_logs')
        .update({
          clock_out: timeStr,
          total_hours: duration
        })
        .eq('id', existingLog.id);

      if (error) throw error;

      showToast('Employee successfully clocked out.');
      createAuditLog(
        currentUser?.id || null,
        currentUser?.username || 'Admin',
        'Override Clock Out',
        `Clocked out employee ${employeeId} on ${dateString}`
      );
      await fetchData();
    } catch (err) {
      console.error(err);
      showToast('Failed to clock out employee.');
    }
  };

  // Delete attendance record
  const handleDeleteAttendance = async (logId: string) => {
    if (window.confirm('Are you sure you want to delete this attendance record?')) {
      try {
        const { error } = await supabase.from('attendance_logs').delete().eq('id', logId);
        if (error) throw error;
        showToast('Attendance record deleted.');
        await fetchData();
      } catch (err) {
        console.error(err);
        showToast('Failed to delete attendance record.');
      }
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
    const existingRemark = getRemark(existingLog.totalHours);
    const existingExtraMins = getExtraHoursMinutes(existingLog.totalHours);
    const existingAllowance = getBreakAllowanceMinutes(existingLog.totalHours);
    const updatedTotalHours = `${rawHoursStr}|${breakMins}|${existingRemark}|${existingExtraMins}|${existingAllowance}`;

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

  // Update break allowance minutes for an attendance record dynamically
  const handleUpdateBreakAllowance = async (logId: string, allowanceMins: number) => {
    const existingLog = attendanceLogs.find(l => l.id === logId);
    if (!existingLog) {
      showToast('Attendance log not found.');
      return;
    }

    const rawHoursStr = existingLog.totalHours.split('|')[0];
    const existingBreak = getBreakMinutes(existingLog.totalHours);
    const existingRemark = getRemark(existingLog.totalHours);
    const existingExtraMins = getExtraHoursMinutes(existingLog.totalHours);
    const updatedTotalHours = `${rawHoursStr}|${existingBreak}|${existingRemark}|${existingExtraMins}|${allowanceMins}`;

    try {
      const { error } = await supabase
        .from('attendance_logs')
        .update({
          total_hours: updatedTotalHours
        })
        .eq('id', logId);

      if (error) throw error;

      showToast('Break allowance updated.');
      await fetchData();
    } catch (err) {
      console.error(err);
      showToast('Failed to update break allowance.');
    }
  };

  // Save changes to edited attendance log
  const handleSaveAttendanceEdit = async (logId: string) => {
    const inTimeStr = editStatus === 'Absent' ? '--:--' : time24To12(editClockIn);
    const outTimeStr = editStatus === 'Absent' ? '--:--' : time24To12(editClockOut);
    const totalHours = calculateDuration(inTimeStr, outTimeStr);

    const existingLog = attendanceLogs.find(l => l.id === logId);
    const breakMins = (existingLog && editStatus !== 'Absent') ? getBreakMinutes(existingLog.totalHours) : 0;
    const totalExtraMins = editStatus === 'Absent' ? 0 : (editExtraHoursHrs * 60 + editExtraHoursMins);
    const existingAllowance = (existingLog && editStatus !== 'Absent') ? getBreakAllowanceMinutes(existingLog.totalHours) : 0;
    const updatedTotalHours = `${totalHours}|${breakMins}|${editStatus === 'Absent' ? '' : editRemark.trim()}|${totalExtraMins}|${existingAllowance}`;

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
    let csvContent = 'Date,Employee ID,Employee Name,Role,Status,Clock In,Clock Out,Total Working Hours,Break Time (mins),Extra Working Hours,Break Allowance (mins),Productive Hours,Remark\n';

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

        const escapedName = `"${emp.name.replace(/"/g, '""')}"`;
        const escapedRole = `"${emp.role.replace(/"/g, '""')}"`;

        const rawHours = totalHours.split('|')[0];
        const breakMins = getBreakMinutes(totalHours);
        const extraHoursStr = getExtraHoursStr(totalHours);
        const breakAllowance = getBreakAllowanceMinutes(totalHours);
        const productiveHours = getProductiveHoursStr(totalHours);
        const remark = getRemark(totalHours);
        const escapedRemark = `"${remark.replace(/"/g, '""')}"`;

        csvContent += `${dateStr},${emp.empId},${escapedName},${escapedRole},${status},${clockIn},${clockOut},${rawHours},${breakMins},${extraHoursStr},${breakAllowance},${productiveHours},${escapedRemark}\n`;
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
    csvContent += 'Date,Status,Clock In,Clock Out,Total Working Hours,Break Time (mins),Extra Working Hours,Break Allowance (mins),Productive Hours,Remark,Minutes Late\n';

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
      const extraHoursStr = getExtraHoursStr(totalHours);
      const breakAllowance = getBreakAllowanceMinutes(totalHours);
      const productiveHours = getProductiveHoursStr(totalHours);
      const remark = getRemark(totalHours);
      const escapedRemark = `"${remark.replace(/"/g, '""')}"`;

      csvContent += `${dateStr},${status},${clockIn},${clockOut},${rawHours},${breakMins},${extraHoursStr},${breakAllowance},${productiveHours},${escapedRemark},${minsLate}\n`;
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
      const extraHoursStr = getExtraHoursStr(totalHours);
      const breakAllowance = getBreakAllowanceMinutes(totalHours);
      const productiveHours = getProductiveHoursStr(totalHours);
      const remark = getRemark(totalHours);

      return `
        <tr>
          <td>${dateStr}</td>
          <td><span class="badge badge-${status.toLowerCase()}">${status}</span></td>
          <td>${clockIn}</td>
          <td>${clockOut}</td>
          <td>${rawHours}</td>
          <td>${breakMins > 0 ? breakMins + ' mins' : '--'}</td>
          <td>${extraHoursStr === '0h 00m' ? '--' : extraHoursStr}</td>
          <td>${breakAllowance > 0 ? breakAllowance + ' mins' : '--'}</td>
          <td><strong>${productiveHours}</strong></td>
          <td>${remark || '--'}</td>
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
              <th>Extra Hours</th>
              <th>Break Allowance</th>
              <th>Productive Hours</th>
              <th>Remark</th>
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
        const extraHoursStr = getExtraHoursStr(totalHours);
        const breakAllowance = getBreakAllowanceMinutes(totalHours);
        const productiveHours = getProductiveHoursStr(totalHours);
        const remark = getRemark(totalHours);

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
            <td>${extraHoursStr === '0h 00m' ? '--' : extraHoursStr}</td>
            <td>${breakAllowance > 0 ? breakAllowance + ' mins' : '--'}</td>
            <td><strong>${productiveHours}</strong></td>
            <td>${remark || '--'}</td>
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
              <th>Extra Hours</th>
              <th>Break Allowance</th>
              <th>Productive Hours</th>
              <th>Remark</th>
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

  // Helper to filter tasks by current view
  const myFilteredTasks = useMemo(() => {
    if (!currentUser) return [];

    const filtered = tasks.filter(t => {
      // Filter by assignee user
      const isMine = t.userId === currentUser.id;

      const matchesSearch = t.title.toLowerCase().includes(taskSearchTerm.toLowerCase()) ||
        t.description.toLowerCase().includes(taskSearchTerm.toLowerCase());

      const matchesPriority = taskPriorityFilter === 'All' || t.priority === taskPriorityFilter;

      let matchesTab = true;
      if (currentTab === 'PendingTasks') {
        matchesTab = t.status === 'Pending' || t.status === 'In Progress';
      } else if (currentTab === 'CompletedTasks') {
        matchesTab = t.status === 'Completed';
      }

      return isMine && matchesSearch && matchesPriority && matchesTab;
    });

    if (currentTab === 'CompletedTasks') {
      return filtered.sort((a, b) => {
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return timeB - timeA;
      });
    }

    return filtered;
  }, [tasks, currentUser, taskSearchTerm, taskPriorityFilter, currentTab]);

  // Count leaves and tasks for current employee
  const employeeStats = useMemo(() => {
    if (!currentUser) return { pendingTasks: 0, completedTasks: 0, approvedLeaves: 0, totalLeavesDays: 0 };
    const myTasks = tasks.filter(t => t.userId === currentUser.id);
    const myLeaves = leaveRequests.filter(l => l.userId === currentUser.id);

    return {
      pendingTasks: myTasks.filter(t => t.status !== 'Completed').length,
      completedTasks: myTasks.filter(t => t.status === 'Completed').length,
      approvedLeaves: myLeaves.filter(l => l.status === 'Approved').length,
      totalLeavesDays: myLeaves.filter(l => l.status === 'Approved').reduce((acc, curr) => acc + curr.totalDays, 0)
    };
  }, [tasks, leaveRequests, currentUser]);

  // Current date/time display for employee dashboard
  const [currentDateTime, setCurrentDateTime] = useState<string>(new Date().toLocaleString());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date().toLocaleString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen text-on-surface bg-background">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-[999] flex items-center gap-2 bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 rounded-lg shadow-xl text-xs border border-white/10 animate-bounce-short">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {!isLoggedIn ? (
        /* HIGHEST FIDELITY LOGIN CANVAS SCREEN */
        <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-primary py-12">
          <div className="fixed inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-[#3fe1fd]/15 rounded-full blur-[120px]"></div>
            <div className="absolute -bottom-[10%] -right-[10%] w-[60%] h-[60%] bg-[#0f4c81]/25 rounded-full blur-[120px]"></div>
          </div>

          <main className="relative z-10 w-full max-w-[440px]">
            <div className="bg-surface-container-lowest rounded-xl p-6 md:p-8 border border-outline-variant custom-shadow transition-transform duration-300 hover:scale-[1.01]">
              <div className="flex flex-col items-center mb-6">
                <div className="mb-4 flex items-center justify-center bg-white p-2 rounded-xl shadow-sm border border-outline-variant">
                  <img src={logoUrl} alt="Zeex-AI Logo" className="h-16 w-auto object-contain" />
                </div>
                <h1 className="font-bold text-2xl text-primary tracking-tight mb-1 text-center">Z-Hajirii Login</h1>
                <p className="text-sm text-on-surface-variant font-medium text-center animate-pulse">Smart HR & Attendance by ZEEXAI</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                {loginError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-error-container/20 border border-error/20">
                    <AlertCircle className="w-5 h-5 text-error shrink-0" />
                    <p className="text-xs text-error font-medium">{loginError}</p>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider" htmlFor="username">
                    Username
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="w-5 h-5 text-on-surface-variant" />
                    </div>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter username"
                      className="block w-full pl-10 pr-4 py-3 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface focus:ring-2 focus:ring-primary-container focus:border-primary outline-none transition-all duration-200"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider" htmlFor="password">
                    Password
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="w-5 h-5 text-on-surface-variant" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="block w-full pl-10 pr-12 py-3 bg-surface-container-lowest border border-outline-variant rounded-lg text-sm text-on-surface focus:ring-2 focus:ring-primary-container focus:border-primary outline-none transition-all duration-200"
                    />
                    <button
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center">
                  <input
                    id="remember"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 text-primary bg-surface-container border-outline-variant rounded focus:ring-primary focus:ring-offset-0"
                  />
                  <label className="ml-2 text-sm text-on-surface-variant cursor-pointer select-none" htmlFor="remember">
                    Remember this device
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 active:scale-[0.98] text-on-primary py-3 rounded-lg text-sm font-semibold transition-all duration-200 flex justify-center items-center gap-2 shadow-sm cursor-pointer"
                >
                  <span>Login</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="mt-6 pt-4 border-t border-outline-variant/30 text-center">
                <p className="text-xs text-on-surface-variant font-medium">
                  © 2026 ZEEXAI Technologies. All rights reserved.
                </p>
              </div>
            </div>
          </main>
        </div>
      ) : (
        /* MAIN APPLICATION CANVAS */
        <div className="min-h-screen flex flex-col bg-surface-container-lowest">
          <Sidebar
            currentTab={currentTab}
            onTabChange={(tab) => {
              setCurrentTab(tab);
              setMobileMenuOpen(false);
            }}
            onLogout={handleLogout}
            selectedUserForProfileName={selectedEmployeeForProfile?.name}
            currentUser={currentUser ? {
              fullName: currentUser.fullName,
              role: currentUser.role,
              designation: currentUser.designation,
              avatarUrl: employees.find(e => e.id === currentUser.employeeId)?.avatarUrl
            } : null}
          />

          <Header
            onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            placeholder={
              currentTab === 'UserManagement'
                ? 'Search users...'
                : currentTab === 'MyTasks' || currentTab === 'PendingTasks' || currentTab === 'CompletedTasks'
                ? 'Search tasks...'
                : 'Search employees...'
            }
            notifications={notifications}
            onMarkRead={handleMarkNotificationRead}
            onMarkAllRead={handleMarkAllNotificationsRead}
            onClearNotifications={handleClearNotifications}
            onSettingsClick={() => setCurrentTab(currentUser?.role === 'Admin' ? 'UserManagement' : 'EmpSettings')}
            currentUser={currentUser ? {
              fullName: currentUser.fullName,
              role: currentUser.role,
              avatarUrl: employees.find(e => e.id === currentUser.employeeId)?.avatarUrl
            } : null}
          />

          {/* MOBILE NAVIGATION SIDEBAR DRAWER */}
          {mobileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
                onClick={() => setMobileMenuOpen(false)}
              />
              <div className="fixed inset-y-0 left-0 w-64 z-50 bg-surface-container-lowest border-r border-outline-variant flex flex-col animate-slide-right lg:hidden">
                <div className="p-6 border-b border-outline-variant/30 flex justify-between items-center">
                  <span className="font-bold text-primary">Z-Hajirii Navigation</span>
                  <button onClick={() => setMobileMenuOpen(false)} className="p-1 hover:bg-surface-container-low rounded-full">
                    <X className="w-5 h-5 text-on-surface" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-1">
                  {currentUser?.role === 'Admin' ? (
                    <>
                      <button
                        onClick={() => { setCurrentTab('Dashboard'); setMobileMenuOpen(false); }}
                        className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left ${currentTab === 'Dashboard' ? 'bg-surface-container-high font-bold text-primary' : 'text-on-surface-variant'}`}
                      >
                        Dashboard
                      </button>
                      <button
                        onClick={() => { setCurrentTab('Attendance'); setMobileMenuOpen(false); }}
                        className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left ${currentTab === 'Attendance' ? 'bg-surface-container-high font-bold text-primary' : 'text-on-surface-variant'}`}
                      >
                        Attendance
                      </button>
                      <button
                        onClick={() => { setCurrentTab('UserManagement'); setMobileMenuOpen(false); }}
                        className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left ${currentTab === 'UserManagement' ? 'bg-surface-container-high font-bold text-primary' : 'text-on-surface-variant'}`}
                      >
                        User Management
                      </button>
                      <button
                        onClick={() => { setCurrentTab('LeaveManagement'); setMobileMenuOpen(false); }}
                        className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left ${currentTab === 'LeaveManagement' ? 'bg-surface-container-high font-bold text-primary' : 'text-on-surface-variant'}`}
                      >
                        Leave Management
                      </button>
                      <button
                        onClick={() => { setCurrentTab('Reports'); setMobileMenuOpen(false); }}
                        className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left ${currentTab === 'Reports' ? 'bg-surface-container-high font-bold text-primary' : 'text-on-surface-variant'}`}
                      >
                        Reports
                      </button>
                      <button
                        onClick={() => { setCurrentTab('TaskDone'); setMobileMenuOpen(false); }}
                        className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left ${currentTab === 'TaskDone' ? 'bg-surface-container-high font-bold text-primary' : 'text-on-surface-variant'}`}
                      >
                        Task Done
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setCurrentTab('EmpDashboard'); setMobileMenuOpen(false); }}
                        className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left ${currentTab === 'EmpDashboard' ? 'bg-surface-container-high font-bold text-primary' : 'text-on-surface-variant'}`}
                      >
                        Dashboard
                      </button>
                      {currentUser?.role === 'Team Leader' && (
                        <button
                          onClick={() => { setCurrentTab('TaskDone'); setMobileMenuOpen(false); }}
                          className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left ${currentTab === 'TaskDone' ? 'bg-surface-container-high font-bold text-primary' : 'text-on-surface-variant'}`}
                        >
                          Task Done
                        </button>
                      )}
                      <button
                        onClick={() => { setCurrentTab('MyTasks'); setMobileMenuOpen(false); }}
                        className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left ${currentTab === 'MyTasks' ? 'bg-surface-container-high font-bold text-primary' : 'text-on-surface-variant'}`}
                      >
                        My Tasks
                      </button>
                      <button
                        onClick={() => { setCurrentTab('LeaveRequests'); setMobileMenuOpen(false); }}
                        className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left ${currentTab === 'LeaveRequests' ? 'bg-surface-container-high font-bold text-primary' : 'text-on-surface-variant'}`}
                      >
                        Leave Applications
                      </button>
                      <button
                        onClick={() => { setCurrentTab('EmpProfile'); setMobileMenuOpen(false); }}
                        className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left ${currentTab === 'EmpProfile' ? 'bg-surface-container-high font-bold text-primary' : 'text-on-surface-variant'}`}
                      >
                        Profile
                      </button>
                      <button
                        onClick={() => { setCurrentTab('EmpSettings'); setMobileMenuOpen(false); }}
                        className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left ${currentTab === 'EmpSettings' ? 'bg-surface-container-high font-bold text-primary' : 'text-on-surface-variant'}`}
                      >
                        Settings
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left text-error hover:bg-error-container/10 mt-8"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </>
          )}

          {/* MAIN PAGE CONTAINER */}
          <main className="flex-1 p-4 sm:p-6 lg:pl-72 space-y-6 overflow-y-auto">
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center p-20 gap-4 text-primary">
                <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
                <p className="text-sm font-bold animate-pulse">Syncing with database...</p>
              </div>
            ) : (
              <>
                {/* 1. ADMIN DASHBOARD */}
                {currentTab === 'Dashboard' && (
                  <div className="space-y-6">
                    {/* Welcome Banner */}
                    <div className="bg-gradient-to-r from-primary to-primary-container p-6 rounded-2xl text-on-primary shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h1 className="font-bold text-2xl tracking-tight">Admin Control Hub</h1>
                        <p className="text-xs text-on-primary/80 font-medium mt-1">Real-time attendance logs and operations review</p>
                      </div>
                      <div className="flex items-center gap-3 bg-white/10 px-4 py-2 rounded-xl backdrop-blur-md border border-white/15">
                        <Calendar className="w-4 h-4 text-white" />
                        <span className="text-xs font-bold">{todayFullDateString}</span>
                      </div>
                    </div>

                    {/* Stats Bento Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant shadow-sm flex flex-col justify-between">
                        <span className="text-xs text-on-surface-variant font-bold uppercase tracking-wider">Total Corporate Size</span>
                        <div className="flex items-baseline gap-2 mt-2">
                          <span className="text-3xl font-extrabold text-primary">{stats.totalEmployees}</span>
                          <span className="text-xs text-on-surface-variant font-medium">staff</span>
                        </div>
                      </div>

                      <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant shadow-sm flex flex-col justify-between">
                        <span className="text-xs text-on-surface-variant font-bold uppercase tracking-wider">Present Today</span>
                        <div className="flex items-baseline gap-2 mt-2">
                          <span className="text-3xl font-extrabold text-emerald-600">{stats.present}</span>
                          <span className="text-xs text-on-surface-variant font-medium">active</span>
                        </div>
                      </div>

                      <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant shadow-sm flex flex-col justify-between">
                        <span className="text-xs text-on-surface-variant font-bold uppercase tracking-wider">Late arrivals</span>
                        <div className="flex items-baseline gap-2 mt-2">
                          <span className="text-3xl font-extrabold text-amber-500">{stats.late}</span>
                          <span className="text-xs text-on-surface-variant font-medium">delayed</span>
                        </div>
                      </div>

                      <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant shadow-sm flex flex-col justify-between">
                        <span className="text-xs text-on-surface-variant font-bold uppercase tracking-wider">Absent today</span>
                        <div className="flex items-baseline gap-2 mt-2">
                          <span className="text-3xl font-extrabold text-error">{stats.absent}</span>
                          <span className="text-xs text-on-surface-variant font-medium">inactive</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick overview of logs today */}
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                        <div>
                          <h2 className="font-bold text-lg text-primary">Today's Presence Review</h2>
                          <p className="text-xs text-on-surface-variant font-medium">Quick indicators and overrides for {dashboardFullDateString}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="date"
                            value={dashboardDate.includes(',') ? new Date().toISOString().split('T')[0] : new Date(dashboardDate).toISOString().split('T')[0]}
                            onChange={(e) => {
                              const parsed = new Date(e.target.value);
                              if (!isNaN(parsed.getTime())) {
                                setDashboardDate(formatDateString(parsed));
                              }
                            }}
                            className="bg-surface-container-low border border-outline-variant rounded-full px-3.5 py-1.5 text-xs text-on-surface focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-outline-variant/40 bg-surface-container-low/20">
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Employee</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Designation</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Status</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">In/Out Times</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {employees.map(emp => {
                              const log = attendanceLogs.find(l => l.employeeId === emp.id && l.date === dashboardDate);
                              const status = log ? log.status : 'Absent';
                              const inTime = log ? log.clockIn : '--:--';
                              const outTime = log ? log.clockOut : '--:--';

                              return (
                                <tr key={emp.id} className="hover:bg-primary/5 transition-colors">
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-3">
                                      <img src={emp.avatarUrl} alt={emp.name} className="w-8 h-8 rounded-full object-cover border border-outline-variant" />
                                      <div>
                                        <p className="font-bold text-sm text-primary">{emp.name}</p>
                                        <p className="text-[11px] text-on-surface-variant">{emp.empId}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-xs font-semibold text-on-surface-variant">{emp.role}</td>
                                  <td className="py-3 px-4">
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                      status === 'Present'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : status === 'Late'
                                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                        : 'bg-red-50 text-red-700 border border-red-200'
                                    }`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${
                                        status === 'Present' ? 'bg-emerald-500' : status === 'Late' ? 'bg-amber-500' : 'bg-red-500'
                                      }`}></span>
                                      {status}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-xs font-medium">
                                    <div className="flex flex-col gap-0.5">
                                      <span>In: <strong className="text-primary">{inTime}</strong></span>
                                      <span>Out: <strong className="text-primary">{outTime}</strong></span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {status === 'Absent' ? (
                                        <button
                                          onClick={() => handleUpdateStatus(emp.id, 'Present', dashboardDate)}
                                          className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-[11px] font-bold transition-all border border-emerald-200/50 cursor-pointer"
                                        >
                                          Present
                                        </button>
                                      ) : (
                                        <>
                                          {outTime === '--:--' && (
                                            <button
                                              onClick={() => handleClockOut(emp.id, dashboardDate)}
                                              className="px-2 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded text-[11px] font-bold transition-all border border-amber-200/50 cursor-pointer"
                                            >
                                              Clock Out
                                            </button>
                                          )}
                                          <button
                                            onClick={() => handleUpdateStatus(emp.id, 'Absent', dashboardDate)}
                                            className="px-2 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded text-[11px] font-bold transition-all border border-red-200/50 cursor-pointer"
                                          >
                                            Absent
                                          </button>
                                        </>
                                      )}
                                      <button
                                        onClick={() => handleViewEmployeeProfile(emp)}
                                        className="px-2 py-1 bg-primary/5 text-primary hover:bg-primary/10 rounded text-[11px] font-bold transition-all border border-primary/10 cursor-pointer"
                                      >
                                        Profile
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Team Leader Task Control Section */}
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-outline-variant/20 pb-4">
                        <div>
                          <h2 className="font-bold text-lg text-primary">Team Leader Task Management</h2>
                          <p className="text-xs text-on-surface-variant font-medium">Assign corporate goals and check status of tasks assigned to Team Leaders.</p>
                        </div>
                        <button
                          onClick={() => {
                            setNewTaskTitle('');
                            setNewTaskDesc('');
                            setNewTaskPriority('Medium');
                            setNewTaskDeadline(getDefaultDeadlineString());
                            setNewTaskAttachment('');
                            const tl = users.find(u => u.role === 'Team Leader' && u.status === 'Active');
                            setNewTaskAssigneeId(tl ? tl.id : '');
                            setIsAddTaskModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-on-primary px-4 py-2 rounded-full text-xs font-semibold shadow-sm transition-all cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          Assign Goal to TL
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-outline-variant/30 bg-surface-container-low/20">
                              <th className="py-2.5 px-3 font-bold text-on-surface-variant uppercase tracking-wider">Team Leader</th>
                              <th className="py-2.5 px-3 font-bold text-on-surface-variant uppercase tracking-wider">Assigned Task / Goal</th>
                              <th className="py-2.5 px-3 font-bold text-on-surface-variant uppercase tracking-wider">Priority</th>
                              <th className="py-2.5 px-3 font-bold text-on-surface-variant uppercase tracking-wider">Deadline</th>
                              <th className="py-2.5 px-3 font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {users.filter(u => u.role === 'Team Leader').length === 0 ? (
                              <tr>
                                <td colSpan={5} className="py-6 text-center text-on-surface-variant/70 font-medium">
                                  No Team Leaders registered yet. Promote an intern from the <strong className="text-primary hover:underline cursor-pointer" onClick={() => setCurrentTab('UserManagement')}>User Management</strong> section.
                                </td>
                              </tr>
                            ) : (
                              users.filter(u => u.role === 'Team Leader').map(tl => {
                                const tlTasks = tasks.filter(t => t.userId === tl.id);
                                return (
                                  <tr key={tl.id} className="hover:bg-primary/5 transition-colors">
                                    <td className="py-3 px-3 font-bold text-primary">
                                      <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full border border-primary/20 bg-primary/10 flex items-center justify-center text-xs">
                                          {tl.fullName.charAt(0)}
                                        </div>
                                        <div>
                                          <p className="font-bold">{tl.fullName}</p>
                                          <p className="text-[10px] text-on-surface-variant font-medium">@{tl.username}</p>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-3 px-3">
                                      {tlTasks.length === 0 ? (
                                        <span className="text-[11px] text-on-surface-variant/70 italic">No tasks assigned yet</span>
                                      ) : (
                                        <div className="space-y-1.5 max-w-md">
                                          {tlTasks.map(t => (
                                            <div key={t.id} className="p-2 bg-slate-50 border border-outline-variant/40 rounded-lg">
                                              <p className="font-semibold text-primary">{t.title}</p>
                                              {t.description && <p className="text-[10px] text-on-surface-variant font-medium mt-0.5">{t.description}</p>}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-3 px-3">
                                      <div className="space-y-1">
                                        {tlTasks.map(t => (
                                          <div key={t.id} className="h-[26px] flex items-center">
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                              t.priority === 'High' ? 'bg-red-50 text-red-700' :
                                              t.priority === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-700'
                                            }`}>
                                              {t.priority}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 font-bold text-on-surface-variant">
                                      <div className="space-y-1">
                                        {tlTasks.map(t => (
                                          <div key={t.id} className="h-[26px] flex items-center">
                                            <span>{formatDeadline(t.deadline)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3">
                                      <div className="space-y-1">
                                        {tlTasks.map(t => (
                                          <div key={t.id} className="h-[26px] flex items-center">
                                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                                              t.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                              t.status === 'In Progress' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-700 border-slate-200'
                                            }`}>
                                              {t.status}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Employee Completed Daily Work Summaries (Task Done) */}
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <h2 className="font-bold text-lg text-primary flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-emerald-600" />
                            Completed Daily Work Summaries (Task Done)
                          </h2>
                          <p className="text-xs text-on-surface-variant font-medium">Review the daily work reports and tasks submitted by employees upon clocking out.</p>
                        </div>
                        
                        {/* Filters */}
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                            <input
                              type="text"
                              placeholder="Filter by name / work..."
                              value={adminTaskDoneSearch}
                              onChange={(e) => setAdminTaskDoneSearch(e.target.value)}
                              className="bg-surface-container-low border border-outline-variant rounded-full pl-9 pr-4 py-1.5 text-xs text-on-surface focus:outline-none"
                            />
                          </div>
                          <input
                            type="date"
                            value={adminTaskDoneDate}
                            onChange={(e) => setAdminTaskDoneDate(e.target.value)}
                            className="bg-surface-container-low border border-outline-variant rounded-full px-3.5 py-1.5 text-xs text-on-surface focus:outline-none"
                          />
                          {adminTaskDoneDate && (
                            <button
                              onClick={() => setAdminTaskDoneDate('')}
                              className="text-xs text-primary font-bold hover:underline cursor-pointer"
                            >
                              Clear Date
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-outline-variant/40 bg-surface-container-low/20">
                              <th className="py-2.5 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Date</th>
                              <th className="py-2.5 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Employee</th>
                              <th className="py-2.5 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Designation / Role</th>
                              <th className="py-2.5 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Work Summary</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {(() => {
                              // Filter completed tasks
                              const completedTasks = tasks.filter(t => t.status === 'Completed');
                              
                              // Filter by search term (employee name or description)
                              const filtered = completedTasks.filter(t => {
                                const employeeUser = users.find(u => u.id === t.userId);
                                const empName = employeeUser ? employeeUser.fullName.toLowerCase() : '';
                                const desc = t.description ? t.description.toLowerCase() : '';
                                const title = t.title ? t.title.toLowerCase() : '';
                                
                                const matchesSearch = empName.includes(adminTaskDoneSearch.toLowerCase()) ||
                                  desc.includes(adminTaskDoneSearch.toLowerCase()) ||
                                  title.includes(adminTaskDoneSearch.toLowerCase());
                                  
                                let matchesDate = true;
                                if (adminTaskDoneDate) {
                                  const completedDateStr = t.completedAt ? new Date(t.completedAt).toISOString().split('T')[0] : '';
                                  const deadlineDateStr = t.deadline ? t.deadline.split('T')[0] : '';
                                  matchesDate = completedDateStr === adminTaskDoneDate || deadlineDateStr === adminTaskDoneDate;
                                }
                                
                                return matchesSearch && matchesDate;
                              });

                              if (filtered.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan={4} className="py-6 text-center text-on-surface-variant/70 font-medium">
                                      No completed work summaries found matching criteria.
                                    </td>
                                  </tr>
                                );
                              }

                              // Sort by completedAt descending
                              const sorted = filtered.sort((a, b) => {
                                const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
                                const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
                                return timeB - timeA;
                              });

                              return sorted.map(t => {
                                const employeeUser = users.find(u => u.id === t.userId);
                                const emp = employees.find(e => e.id === employeeUser?.employeeId);
                                const dateFormatted = t.completedAt ? new Date(t.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date';
                                return (
                                  <tr key={t.id} className="hover:bg-primary/5 transition-colors">
                                    <td className="py-3 px-3 font-bold text-on-surface whitespace-nowrap">{dateFormatted}</td>
                                    <td className="py-3 px-3">
                                      <div className="flex items-center gap-3">
                                        {emp?.avatarUrl ? (
                                          <img src={emp.avatarUrl} alt={employeeUser?.fullName} className="w-7 h-7 rounded-full object-cover border border-outline-variant" />
                                        ) : (
                                          <div className="w-7 h-7 rounded-full border border-primary/20 bg-primary/5 flex items-center justify-center text-primary font-bold">
                                            {employeeUser?.fullName?.charAt(0)}
                                          </div>
                                        )}
                                        <div>
                                          <p className="font-bold text-primary">{employeeUser?.fullName || 'Unknown Employee'}</p>
                                          <p className="text-[10px] text-on-surface-variant font-medium">@{employeeUser?.username}</p>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 text-on-surface-variant font-semibold">{employeeUser?.designation || employeeUser?.role}</td>
                                    <td className="py-3 px-3 max-w-md">
                                      <p className="font-bold text-primary text-[11px] mb-0.5">{t.title}</p>
                                      <p className="text-on-surface text-xs leading-relaxed whitespace-pre-line font-medium">{t.description}</p>
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. ADMIN ATTENDANCE LOGS SCREEN */}
                {currentTab === 'Attendance' && (
                  <div className="space-y-6">
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-6">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <h2 className="font-bold text-lg text-primary">Attendance Records Log</h2>
                          <p className="text-xs text-on-surface-variant font-medium">Verify employee logs, edit clock details, breaks, allowances, and remarks.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setIsExportModalOpen(true)}
                            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-on-primary px-4 py-2 rounded-full text-xs font-semibold shadow-sm transition-all cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Export CSV / PDF
                          </button>
                        </div>
                      </div>

                      {/* Filter Bar */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-surface-container-low/40 rounded-xl border border-outline-variant/30">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                          <input
                            type="text"
                            placeholder="Search corporate ID or name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white border border-outline-variant rounded-lg pl-9 pr-3 py-1.5 text-xs text-on-surface focus:outline-none"
                          />
                        </div>

                        <div>
                          <select
                            value={selectedAttendanceDate}
                            onChange={(e) => setSelectedAttendanceDate(e.target.value)}
                            className="w-full bg-white border border-outline-variant rounded-lg px-3 py-1.5 text-xs text-on-surface focus:outline-none"
                          >
                            {uniqueAttendanceDates.map(date => (
                              <option key={date} value={date}>{date}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <select
                            value={attendanceStatusFilter}
                            onChange={(e) => setAttendanceStatusFilter(e.target.value)}
                            className="w-full bg-white border border-outline-variant rounded-lg px-3 py-1.5 text-xs text-on-surface focus:outline-none"
                          >
                            <option value="All Statuses">All Statuses</option>
                            <option value="Present">Present</option>
                            <option value="Late">Late</option>
                            <option value="Absent">Absent</option>
                          </select>
                        </div>
                      </div>

                      {/* Main Records Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-outline-variant/40 bg-surface-container-low/20">
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Employee</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Status</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Times (In / Out)</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Work Hours</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Break (min)</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Break Allow</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Productive</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Remark / Extras</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {filteredAttendanceEmployees.map(emp => {
                              const log = attendanceLogs.find(l => l.employeeId === emp.id && l.date === selectedAttendanceDate);
                              const logExists = !!log;
                              const status = log ? log.status : 'Absent';
                              const inTime = log ? log.clockIn : '--:--';
                              const outTime = log ? log.clockOut : '--:--';
                              const totalHoursStr = log ? log.totalHours : '0h 00m';

                              const rawHours = totalHoursStr.split('|')[0];
                              const breakMins = getBreakMinutes(totalHoursStr);
                              const remark = getRemark(totalHoursStr);
                              const extraMins = getExtraHoursMinutes(totalHoursStr);
                              const breakAllowance = getBreakAllowanceMinutes(totalHoursStr);
                              const productiveHours = getProductiveHoursStr(totalHoursStr);

                              const isEditingThisRow = logExists && editingLogId === log.id;

                              return (
                                <tr key={emp.id} className="hover:bg-primary/5 transition-colors">
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-3">
                                      <img src={emp.avatarUrl} alt={emp.name} className="w-8 h-8 rounded-full object-cover border border-outline-variant" />
                                      <div>
                                        <p className="font-bold text-sm text-primary">{emp.name}</p>
                                        <p className="text-[11px] text-on-surface-variant">{emp.empId}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4">
                                    {isEditingThisRow ? (
                                      <select
                                        value={editStatus}
                                        onChange={(e) => setEditStatus(e.target.value as any)}
                                        className="bg-white border border-outline-variant rounded p-1 text-xs"
                                      >
                                        <option value="Present">Present</option>
                                        <option value="Late">Late</option>
                                        <option value="Absent">Absent</option>
                                      </select>
                                    ) : (
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                        status === 'Present'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : status === 'Late'
                                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                          : 'bg-red-50 text-red-700 border border-red-200'
                                      }`}>
                                        {status}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-xs font-semibold">
                                    {isEditingThisRow ? (
                                      <div className="flex flex-col gap-1">
                                        <input
                                          type="time"
                                          value={editClockIn}
                                          onChange={(e) => setEditClockIn(e.target.value)}
                                          className="bg-white border border-outline-variant rounded p-0.5 text-xs max-w-[80px]"
                                          disabled={editStatus === 'Absent'}
                                        />
                                        <input
                                          type="time"
                                          value={editClockOut}
                                          onChange={(e) => setEditClockOut(e.target.value)}
                                          className="bg-white border border-outline-variant rounded p-0.5 text-xs max-w-[80px]"
                                          disabled={editStatus === 'Absent'}
                                        />
                                      </div>
                                    ) : (
                                      <div className="flex flex-col gap-0.5">
                                        <span>In: <strong>{inTime}</strong></span>
                                        <span>Out: <strong>{outTime}</strong></span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-xs font-bold text-primary">{rawHours}</td>
                                  <td className="py-3 px-4 text-xs">
                                    {logExists && !isEditingThisRow ? (
                                      <input
                                        type="number"
                                        min="0"
                                        max="480"
                                        value={breakMins}
                                        onChange={(e) => handleUpdateBreakMinutes(log.id, parseInt(e.target.value) || 0)}
                                        className="w-12 bg-surface-container-low border border-outline-variant rounded px-1.5 py-0.5 font-semibold text-center focus:outline-none focus:ring-1 focus:ring-primary"
                                      />
                                    ) : '--'}
                                  </td>
                                  <td className="py-3 px-4 text-xs">
                                    {logExists && !isEditingThisRow ? (
                                      <input
                                        type="number"
                                        min="0"
                                        max="120"
                                        value={breakAllowance}
                                        onChange={(e) => handleUpdateBreakAllowance(log.id, parseInt(e.target.value) || 0)}
                                        className="w-12 bg-surface-container-low border border-outline-variant rounded px-1.5 py-0.5 font-semibold text-center focus:outline-none focus:ring-1 focus:ring-primary"
                                      />
                                    ) : '--'}
                                  </td>
                                  <td className="py-3 px-4 text-xs font-extrabold text-emerald-600">{productiveHours}</td>
                                  <td className="py-3 px-4 text-xs">
                                    {isEditingThisRow ? (
                                      <div className="flex flex-col gap-1">
                                        <input
                                          type="text"
                                          value={editRemark}
                                          onChange={(e) => setEditRemark(e.target.value)}
                                          placeholder="Remark"
                                          className="bg-white border border-outline-variant rounded p-0.5 text-xs max-w-[120px]"
                                          disabled={editStatus === 'Absent'}
                                        />
                                        <div className="flex gap-1 items-center">
                                          <input
                                            type="number"
                                            value={editExtraHoursHrs}
                                            onChange={(e) => setEditExtraHoursHrs(parseInt(e.target.value) || 0)}
                                            placeholder="Hrs"
                                            className="bg-white border border-outline-variant rounded p-0.5 text-xs w-10 text-center"
                                            disabled={editStatus === 'Absent'}
                                          />
                                          <span>h</span>
                                          <input
                                            type="number"
                                            value={editExtraHoursMins}
                                            onChange={(e) => setEditExtraHoursMins(parseInt(e.target.value) || 0)}
                                            placeholder="Min"
                                            className="bg-white border border-outline-variant rounded p-0.5 text-xs w-10 text-center"
                                            disabled={editStatus === 'Absent'}
                                          />
                                          <span>m</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col gap-0.5 text-[11px] text-on-surface-variant">
                                        {remark && <span className="font-semibold italic">"{remark}"</span>}
                                        {extraMins > 0 && <span className="text-emerald-700 font-bold">Extra: +{getExtraHoursStr(totalHoursStr)}</span>}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-xs">
                                    {isEditingThisRow ? (
                                      <div className="flex gap-1">
                                        <button
                                          onClick={() => handleSaveAttendanceEdit(log.id)}
                                          className="p-1 hover:bg-emerald-50 text-emerald-600 rounded cursor-pointer"
                                        >
                                          <Check className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => setEditingLogId(null)}
                                          className="p-1 hover:bg-red-50 text-error rounded cursor-pointer"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </div>
                                    ) : logExists ? (
                                      <div className="flex gap-1.5">
                                        <button
                                          onClick={() => {
                                            setEditingLogId(log.id);
                                            setEditClockIn(time12To24(log.clockIn));
                                            setEditClockOut(time12To24(log.clockOut));
                                            setEditStatus(log.status);
                                            setEditRemark(remark);
                                            setEditExtraHoursHrs(Math.floor(extraMins / 60));
                                            setEditExtraHoursMins(extraMins % 60);
                                          }}
                                          className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-primary transition-all cursor-pointer"
                                          title="Edit details"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteAttendance(log.id)}
                                          className="p-1 hover:bg-red-50 rounded text-on-surface-variant hover:text-error transition-all cursor-pointer"
                                          title="Delete log"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => handleUpdateStatus(emp.id, 'Present', selectedAttendanceDate)}
                                        className="px-2.5 py-1 bg-primary text-on-primary hover:bg-primary/90 rounded text-[11px] font-bold transition-all shadow-sm cursor-pointer"
                                      >
                                        Log Clock In
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. ADMIN: USER MANAGEMENT MODULE */}
                {currentTab === 'UserManagement' && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-6">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <h2 className="font-bold text-lg text-primary">User Directory & Credentials</h2>
                          <p className="text-xs text-on-surface-variant font-medium">Manage user credentials, roles (RBAC), departments, status and linked corporate IDs.</p>
                        </div>
                        <button
                          onClick={() => {
                            setEditingUser(null);
                            setUserFormFullName('');
                            setUserFormUsername('');
                            setUserFormEmail('');
                            setUserFormPhone('');
                            setUserFormDesignation('');
                            setUserFormDepartment('');
                            setUserFormJoiningDate(new Date().toISOString().split('T')[0]);
                            setUserFormRole('Employee');
                            setUserFormStatus('Active');
                            setUserFormPassword('');
                            setUserFormEmployeeId('');
                            setUserFormInternType('Online Intern');
                            setUserFormManagerId('');
                            setIsUserModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-on-primary px-4 py-2 rounded-full text-xs font-semibold shadow-sm transition-all cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          Add User
                        </button>
                      </div>

                      {/* Directory Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-outline-variant/40 bg-surface-container-low/20">
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">User Account</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Role</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Department / Designation</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Contact</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Status</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {users.map((u) => {
                              const avatar = employees.find(e => e.id === u.employeeId)?.avatarUrl;

                              return (
                                <tr key={u.id} className="hover:bg-primary/5 transition-colors">
                                  <td className="py-4 px-4">
                                    <div className="flex items-center gap-3">
                                      {avatar ? (
                                        <img src={avatar} alt={u.fullName} className="w-9 h-9 rounded-full object-cover border border-outline-variant" />
                                      ) : (
                                        <div className="w-9 h-9 rounded-full border border-primary/20 bg-primary/5 flex items-center justify-center text-primary font-bold text-sm">
                                          {u.fullName.charAt(0)}
                                        </div>
                                      )}
                                      <div>
                                        <p className="font-bold text-sm text-primary">{u.fullName}</p>
                                        <p className="text-[11px] text-on-surface-variant font-medium">@{u.username}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-4 px-4">
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                      u.role === 'Admin'
                                        ? 'bg-red-50 text-red-700 border border-red-200'
                                        : u.role === 'Team Leader'
                                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    }`}>
                                      {u.role}
                                    </span>
                                  </td>
                                  <td className="py-4 px-4 text-xs font-semibold text-on-surface-variant">
                                    <div className="flex flex-col">
                                      <span>{u.designation}</span>
                                      <span className="text-[10px] text-on-surface-variant/70 font-normal">{u.department}</span>
                                    </div>
                                  </td>
                                  <td className="py-4 px-4 text-xs font-medium text-on-surface-variant">
                                    <div className="flex flex-col">
                                      <span>{u.email}</span>
                                      {u.phoneNumber && <span className="text-[10px] text-on-surface-variant/70">{u.phoneNumber}</span>}
                                    </div>
                                  </td>
                                  <td className="py-4 px-4">
                                    <button
                                      onClick={() => handleToggleUserStatus(u)}
                                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border cursor-pointer hover:scale-95 transition-transform ${
                                        u.status === 'Active'
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : 'bg-red-50 text-red-700 border-red-200'
                                      }`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'Active' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                                      {u.status}
                                    </button>
                                  </td>
                                  <td className="py-4 px-4 text-xs">
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => {
                                          setEditingUser(u);
                                          setUserFormFullName(u.fullName);
                                          setUserFormUsername(u.username);
                                          setUserFormEmail(u.email);
                                          setUserFormPhone(u.phoneNumber || '');
                                          setUserFormDesignation(u.designation);
                                          setUserFormDepartment(u.department);
                                          setUserFormJoiningDate(u.joiningDate || '');
                                          setUserFormRole(u.role);
                                          setUserFormStatus(u.status);
                                          setUserFormInternType(u.internType || 'Online Intern');
                                          setUserFormPassword('');
                                          setUserFormEmployeeId(employees.find(e => e.id === u.employeeId)?.empId || '');
                                          setUserFormManagerId(u.managerId || '');
                                          setIsUserModalOpen(true);
                                        }}
                                        className="p-1 hover:bg-surface-container rounded text-primary transition-all cursor-pointer"
                                        title="Edit profile & details"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                      {u.role === 'Employee' && (
                                        <button
                                          onClick={() => handlePromoteToTeamLeader(u)}
                                          className="p-1 hover:bg-teal-50 rounded text-teal-600 transition-all cursor-pointer"
                                          title="Promote to Team Leader"
                                        >
                                          <Award className="w-4 h-4" />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleDeleteUserFlow(u.id, u.fullName, u.employeeId)}
                                        className="p-1 hover:bg-red-50 rounded text-error transition-all cursor-pointer"
                                        title="Delete user account"
                                        disabled={u.id === currentUser?.id}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3.1. ADMIN: TEAM LEADERS HIERARCHY */}
                {currentTab === 'AdminTeamLeaders' && (
                  <div className="space-y-6 animate-fade-in">
                    {/* Welcome Banner */}
                    <div className="bg-gradient-to-r from-[#1b365d] to-[#0b2046] p-6 rounded-2xl text-white shadow-md">
                      <h1 className="font-bold text-2xl tracking-tight">Team Leaders & Org Structure</h1>
                      <p className="text-xs text-white/80 font-medium mt-1">Visualize organizational reporting structure, active team leaders, and their assigned interns.</p>
                    </div>

                    {/* Flow Chart / Hierarchy Visualizer */}
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-6">
                      <div>
                        <h2 className="font-bold text-lg text-primary">Organizational Hierarchy Diagram</h2>
                        <p className="text-xs text-on-surface-variant font-medium">Flow chart showing relationship between Admin, Team Leaders, and assigned Interns.</p>
                      </div>

                      <div className="flex flex-col items-center justify-center p-8 bg-slate-50 rounded-xl border border-outline-variant/30 overflow-x-auto min-w-full">
                        {/* Admin Node */}
                        <div className="flex flex-col items-center">
                          <div className="bg-indigo-600 text-white px-6 py-3 rounded-xl shadow-md border border-indigo-700 flex flex-col items-center text-center">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-200">System Admin</span>
                            <span className="font-bold text-xs mt-0.5">{users.find(u => u.role === 'Admin')?.fullName || 'Admin User'}</span>
                          </div>
                          
                          {/* Vertical Connector */}
                          <div className="w-0.5 h-8 bg-indigo-300"></div>
                        </div>

                        {/* Team Leaders Level */}
                        {users.filter(u => u.role === 'Team Leader').length === 0 ? (
                          <div className="flex flex-col items-center">
                            <div className="w-48 h-0.5 bg-indigo-300"></div>
                            <p className="text-xs text-on-surface-variant/70 italic mt-4 font-semibold">No Team Leaders registered yet. Promote or register team leaders to see flowchart.</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center w-full">
                            {/* Horizontal span connecting TLs */}
                            <div className="w-3/4 h-0.5 bg-indigo-300"></div>
                            
                            <div className="flex flex-wrap justify-center gap-8 mt-4 w-full">
                              {users.filter(u => u.role === 'Team Leader').map(tl => {
                                const myInterns = users.filter(u => u.managerId === tl.id);
                                return (
                                  <div key={tl.id} className="flex flex-col items-center">
                                    {/* TL connector */}
                                    <div className="w-0.5 h-4 bg-indigo-300 -mt-4"></div>
                                    
                                    {/* Team Leader Node */}
                                    <div className="bg-teal-600 text-white px-5 py-2.5 rounded-xl shadow-md border border-teal-700 flex flex-col items-center text-center max-w-[200px]">
                                      <span className="text-[9px] uppercase font-bold tracking-widest text-teal-200">Team Leader</span>
                                      <span className="font-bold text-xs mt-0.5">{tl.fullName}</span>
                                      <span className="text-[9px] text-white/70">@{tl.username}</span>
                                    </div>

                                    {/* Connection to Interns */}
                                    {myInterns.length > 0 && (
                                      <div className="flex flex-col items-center w-full">
                                        <div className="w-0.5 h-6 bg-teal-300"></div>
                                        <div className="w-3/4 h-0.5 bg-teal-300"></div>
                                        <div className="flex gap-4 mt-3">
                                          {myInterns.map(intern => (
                                            <div key={intern.id} className="flex flex-col items-center">
                                              <div className="w-0.5 h-3 bg-teal-300 -mt-3"></div>
                                              <div className="bg-white border border-outline-variant px-3 py-1.5 rounded-lg shadow-xs flex flex-col items-center text-center max-w-[120px]">
                                                <span className="font-bold text-[10px] text-primary truncate max-w-[100px]">{intern.fullName}</span>
                                                <span className="text-[9px] text-on-surface-variant font-medium">@{intern.username}</span>
                                                <span className="text-[8px] mt-0.5 text-on-surface-variant/80 px-1 py-0.5 bg-slate-100 rounded text-center scale-90">{intern.internType || 'Online'}</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Team Leader Details Directory */}
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-6">
                      <div>
                        <h2 className="font-bold text-lg text-primary">Team Leaders & Assigned Members</h2>
                        <p className="text-xs text-on-surface-variant font-medium">Breakdown list of all team leaders and interns reporting to them.</p>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-outline-variant/40 bg-surface-container-low/20">
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Team Leader</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Designation / Dept</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Assigned Interns Count</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Intern Breakdown</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {users.filter(u => u.role === 'Team Leader').length === 0 ? (
                              <tr>
                                <td colSpan={4} className="py-6 text-center text-on-surface-variant/70 font-semibold">
                                  No Team Leaders found. Go to <strong className="text-primary">User Management</strong> to promote or create one.
                                </td>
                              </tr>
                            ) : (
                              users.filter(u => u.role === 'Team Leader').map(tl => {
                                const myInterns = users.filter(u => u.managerId === tl.id);
                                return (
                                  <tr key={tl.id} className="hover:bg-primary/5 transition-colors">
                                    <td className="py-3.5 px-4">
                                      <div className="font-bold text-primary text-sm">{tl.fullName}</div>
                                      <div className="text-[10px] text-on-surface-variant">@{tl.username} • {tl.email}</div>
                                    </td>
                                    <td className="py-3.5 px-4 font-semibold text-on-surface-variant">
                                      {tl.designation} ({tl.department})
                                    </td>
                                    <td className="py-3.5 px-4">
                                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                        {myInterns.length} Interns
                                      </span>
                                    </td>
                                    <td className="py-3.5 px-4">
                                      {myInterns.length === 0 ? (
                                        <span className="text-[10px] text-on-surface-variant/60 italic">No assigned interns</span>
                                      ) : (
                                        <div className="flex flex-wrap gap-1.5">
                                          {myInterns.map(i => (
                                            <span key={i.id} className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-medium bg-slate-100 border border-slate-200 text-on-surface-variant">
                                              {i.fullName} (@{i.username})
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3.2. ADMIN: TEAM LEADER TASKS MANAGEMENT */}
                {currentTab === 'AdminTLTasks' && (
                  <div className="space-y-6 animate-fade-in">
                    {/* Welcome Banner */}
                    <div className="bg-gradient-to-r from-[#1b365d] to-[#0b2046] p-6 rounded-2xl text-white shadow-md">
                      <h1 className="font-bold text-2xl tracking-tight">Team Leader Task Console</h1>
                      <p className="text-xs text-white/80 font-medium mt-1">Assign critical operations goals to Team Leaders and monitor their completion statuses.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Left: Assign Goal Form */}
                      <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-4">
                        <div>
                          <h2 className="font-bold text-base text-primary">Assign New Goal to TL</h2>
                          <p className="text-[11px] text-on-surface-variant font-medium">Create a task specifically for an active Team Leader.</p>
                        </div>

                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (!newTaskTitle.trim() || !newTaskAssigneeId) {
                              showToast('Please provide a task title and select a Team Leader.');
                              return;
                            }
                            const task: TaskRecord = {
                              id: `task-${Date.now()}`,
                              userId: newTaskAssigneeId,
                              title: newTaskTitle.trim(),
                              description: newTaskDesc.trim(),
                              priority: newTaskPriority,
                              deadline: newTaskDeadline || getDefaultDeadlineString(),
                              status: 'Pending',
                              attachment: newTaskAttachment.trim(),
                              createdAt: new Date().toISOString()
                            };
                            await saveTask(task);
                            showToast(`Goal assigned to Team Leader successfully.`);
                            // Reset state
                            setNewTaskTitle('');
                            setNewTaskDesc('');
                            setNewTaskPriority('Medium');
                            setNewTaskDeadline(getDefaultDeadlineString());
                            setNewTaskAssigneeId('');
                            setNewTaskAttachment('');
                            await fetchData();
                          }}
                          className="space-y-3.5 text-xs font-semibold text-on-surface-variant"
                        >
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold tracking-wider">Select Team Leader</label>
                            <select
                              required
                              value={newTaskAssigneeId}
                              onChange={(e) => setNewTaskAssigneeId(e.target.value)}
                              className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                            >
                              <option value="">-- Choose Team Leader --</option>
                              {users.filter(u => u.role === 'Team Leader').map(tl => (
                                <option key={tl.id} value={tl.id}>
                                  {tl.fullName} (@{tl.username})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold tracking-wider">Goal Title</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Design System Implementation"
                              value={newTaskTitle}
                              onChange={(e) => setNewTaskTitle(e.target.value)}
                              className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold tracking-wider">Description</label>
                            <textarea
                              placeholder="Describe the outcomes expected..."
                              value={newTaskDesc}
                              onChange={(e) => setNewTaskDesc(e.target.value)}
                              rows={3}
                              className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none resize-none"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase font-bold tracking-wider">Priority</label>
                              <select
                                value={newTaskPriority}
                                onChange={(e) => setNewTaskPriority(e.target.value as any)}
                                className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2 text-xs text-on-surface focus:outline-none"
                              >
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase font-bold tracking-wider">Deadline</label>
                              <input
                                type="datetime-local"
                                required
                                value={newTaskDeadline}
                                onChange={(e) => setNewTaskDeadline(e.target.value)}
                                className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2 text-xs text-on-surface focus:outline-none"
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold tracking-wider">Attachment URL (Optional)</label>
                            <input
                              type="text"
                              placeholder="e.g. https://docs.google.com/..."
                              value={newTaskAttachment}
                              onChange={(e) => setNewTaskAttachment(e.target.value)}
                              className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                            />
                          </div>

                          <button
                            type="submit"
                            className="w-full bg-primary hover:bg-primary/95 text-on-primary font-bold py-2.5 rounded-xl shadow-sm text-xs cursor-pointer mt-2"
                          >
                            Assign Goal to TL
                          </button>
                        </form>
                      </div>

                      {/* Right: Tasks tables */}
                      <div className="lg:col-span-2 space-y-6">
                        {/* Pending Tasks */}
                        <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-4">
                          <div>
                            <h2 className="font-bold text-base text-primary">Pending Goals</h2>
                            <p className="text-[11px] text-on-surface-variant font-medium">Active pending goals assigned to your Team Leaders.</p>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-outline-variant/40 bg-surface-container-low/20">
                                  <th className="py-2 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">TL Name</th>
                                  <th className="py-2 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Goal Title</th>
                                  <th className="py-2 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Priority</th>
                                  <th className="py-2 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Deadline</th>
                                  <th className="py-2 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-outline-variant/20">
                                {(() => {
                                  const tlIds = users.filter(u => u.role === 'Team Leader').map(u => u.id);
                                  const pendingTLTasks = tasks.filter(t => tlIds.includes(t.userId) && t.status !== 'Completed');

                                  if (pendingTLTasks.length === 0) {
                                    return (
                                      <tr>
                                        <td colSpan={5} className="py-6 text-center text-on-surface-variant/70 font-semibold">
                                          No pending Team Leader goals.
                                        </td>
                                      </tr>
                                    );
                                  }

                                  return pendingTLTasks.map(t => {
                                    const tl = users.find(u => u.id === t.userId);
                                    return (
                                      <tr key={t.id} className="hover:bg-primary/5 transition-colors">
                                        <td className="py-2.5 px-3">
                                          <p className="font-bold text-primary">{tl?.fullName}</p>
                                          <p className="text-[9px] text-on-surface-variant">@{tl?.username}</p>
                                        </td>
                                        <td className="py-2.5 px-3 font-semibold text-on-surface">{t.title}</td>
                                        <td className="py-2.5 px-3">
                                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                            t.priority === 'High' ? 'bg-red-50 text-error' : t.priority === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                                          }`}>
                                            {t.priority}
                                          </span>
                                        </td>
                                        <td className="py-2.5 px-3 text-on-surface-variant font-medium">{formatDeadline(t.deadline)}</td>
                                        <td className="py-2.5 px-3">
                                          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                                            {t.status}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Completed Tasks */}
                        <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-4">
                          <div>
                            <h2 className="font-bold text-base text-emerald-700">Completed Goals</h2>
                            <p className="text-[11px] text-on-surface-variant font-medium">Goals successfully completed by Team Leaders.</p>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-outline-variant/40 bg-surface-container-low/20">
                                  <th className="py-2 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">TL Name</th>
                                  <th className="py-2 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Goal Title</th>
                                  <th className="py-2 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Attachment</th>
                                  <th className="py-2 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Completed At</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-outline-variant/20">
                                {(() => {
                                  const tlIds = users.filter(u => u.role === 'Team Leader').map(u => u.id);
                                  const completedTLTasks = tasks.filter(t => tlIds.includes(t.userId) && t.status === 'Completed');

                                  if (completedTLTasks.length === 0) {
                                    return (
                                      <tr>
                                        <td colSpan={4} className="py-6 text-center text-on-surface-variant/70 font-semibold">
                                          No completed goals yet.
                                        </td>
                                      </tr>
                                    );
                                  }

                                  return completedTLTasks.map(t => {
                                    const tl = users.find(u => u.id === t.userId);
                                    return (
                                      <tr key={t.id} className="hover:bg-primary/5 transition-colors">
                                        <td className="py-2.5 px-3">
                                          <p className="font-bold text-primary">{tl?.fullName}</p>
                                          <p className="text-[9px] text-on-surface-variant">@{tl?.username}</p>
                                        </td>
                                        <td className="py-2.5 px-3 font-semibold text-on-surface">{t.title}</td>
                                        <td className="py-2.5 px-3 font-medium">
                                          {t.attachment ? (
                                            <a
                                              href={t.attachment.startsWith('http') ? t.attachment : `https://${t.attachment}`}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="inline-flex items-center gap-1 text-primary hover:underline font-bold"
                                            >
                                              <FileText className="w-3.5 h-3.5" />
                                              View
                                            </a>
                                          ) : (
                                            <span className="text-[9px] text-on-surface-variant/60 italic">No document</span>
                                          )}
                                        </td>
                                        <td className="py-2.5 px-3 font-bold text-emerald-700">
                                          {t.completedAt ? new Date(t.completedAt).toLocaleDateString() : 'Just now'}
                                        </td>
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. ADMIN: LEAVE MANAGEMENT MODULE */}
                {currentTab === 'LeaveManagement' && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-6">
                      <div>
                        <h2 className="font-bold text-lg text-primary">Employee Leave Requests</h2>
                        <p className="text-xs text-on-surface-variant font-medium">Review and process all submitted employee leave applications.</p>
                      </div>

                      {/* Leaves List */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-outline-variant/40 bg-surface-container-low/20">
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Employee</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Leave Details</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Duration</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Reason / Description</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Status</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {leaveRequests.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="py-8 text-center text-xs text-on-surface-variant font-medium">
                                  No leave requests submitted.
                                </td>
                              </tr>
                            ) : (
                              leaveRequests.map((l) => {
                                const applicant = users.find(u => u.id === l.userId);
                                const avatar = employees.find(e => e.id === applicant?.employeeId)?.avatarUrl;

                                return (
                                  <tr key={l.id} className="hover:bg-primary/5 transition-colors">
                                    <td className="py-4 px-4">
                                      <div className="flex items-center gap-3">
                                        {avatar ? (
                                          <img src={avatar} alt={applicant?.fullName} className="w-8 h-8 rounded-full object-cover border border-outline-variant" />
                                        ) : (
                                          <div className="w-8 h-8 rounded-full border border-primary/20 bg-primary/5 flex items-center justify-center text-primary font-bold text-xs">
                                            {applicant?.fullName.charAt(0) || 'E'}
                                          </div>
                                        )}
                                        <div>
                                          <p className="font-bold text-sm text-primary">{applicant ? applicant.fullName : 'Employee'}</p>
                                          <p className="text-[10px] text-on-surface-variant">{applicant ? applicant.designation : ''}</p>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-4 px-4 text-xs font-semibold text-on-surface-variant">
                                      <div className="flex flex-col">
                                        <span className="text-primary font-bold">{l.leaveType}</span>
                                        <span className="text-[10px] font-normal text-on-surface-variant/80">From: {l.fromDate} to {l.toDate}</span>
                                      </div>
                                    </td>
                                    <td className="py-4 px-4 text-xs font-bold text-primary">
                                      {l.totalDays} days
                                    </td>
                                    <td className="py-4 px-4 text-xs text-on-surface-variant">
                                      <div className="max-w-[240px]">
                                        <p className="font-bold">"{l.reason}"</p>
                                        {l.description && <p className="text-[11px] font-medium leading-relaxed mt-0.5">{l.description}</p>}
                                        {l.attachment && (
                                          <a
                                            href={l.attachment}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline mt-1.5"
                                          >
                                            <Paperclip className="w-3 h-3" />
                                            View Document Attachment
                                          </a>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-4 px-4">
                                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                                        l.status === 'Approved'
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : l.status === 'Rejected'
                                          ? 'bg-red-50 text-red-700 border-red-200'
                                          : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                                      }`}>
                                        {l.status}
                                      </span>
                                      {l.adminComment && (
                                        <span className="block text-[10px] text-on-surface-variant/70 font-medium italic mt-1 max-w-[150px] truncate" title={l.adminComment}>
                                          C: "{l.adminComment}"
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-4 px-4 text-xs">
                                      {l.status === 'Pending' ? (
                                        <div className="flex gap-1">
                                          <button
                                            onClick={() => {
                                              setSelectedLeaveForAdminAction(l);
                                              setAdminLeaveActionType('Approved');
                                              setAdminLeaveComment('');
                                              setIsAdminLeaveCommentModalOpen(true);
                                            }}
                                            className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded font-bold border border-emerald-200 cursor-pointer"
                                          >
                                            Approve
                                          </button>
                                          <button
                                            onClick={() => {
                                              setSelectedLeaveForAdminAction(l);
                                              setAdminLeaveActionType('Rejected');
                                              setAdminLeaveComment('');
                                              setIsAdminLeaveCommentModalOpen(true);
                                            }}
                                            className="px-2 py-1 bg-red-50 hover:bg-red-100 text-error rounded font-bold border border-error/20 cursor-pointer"
                                          >
                                            Reject
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="text-[11px] text-on-surface-variant/60 font-semibold italic">Processed</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. ADMIN REPORTS / TRENDS */}
                {currentTab === 'Reports' && selectedEmployeeForProfile && (
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h1 className="font-bold text-2xl text-primary tracking-tight">Attendance analytics: {selectedEmployeeForProfile.name}</h1>
                        <p className="text-xs text-on-surface-variant font-medium">Verify stats metrics, week trends and historical daywise attendance list.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={selectedEmployeeForProfile.id}
                          onChange={(e) => {
                            const emp = employees.find(x => x.id === e.target.value);
                            if (emp) setSelectedEmployeeForProfile(emp);
                          }}
                          className="bg-white border border-outline-variant rounded-full px-4 py-2 text-xs font-semibold text-on-surface focus:outline-none"
                        >
                          {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.name} ({emp.empId})</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Detailed User Profile Header */}
                    <section className="bg-white border border-outline-variant rounded-2xl p-8 flex flex-col md:flex-row items-center gap-6 shadow-sm">
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
                        <h2 className="text-3xl font-bold text-[#0f4c81] tracking-tight">{selectedEmployeeForProfile.name}</h2>
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
                          className="px-6 py-2 bg-primary text-on-primary font-semibold text-sm rounded-lg hover:brightness-110 transition-all cursor-pointer shadow-md"
                        >
                          Generate Report
                        </button>
                      </div>
                    </section>

                    {/* Summary Bento Stats */}
                    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="bg-white border border-outline-variant rounded-2xl p-6 flex items-center gap-4 shadow-sm">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
                          <Check className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Present Days</p>
                          <p className="text-2xl font-bold">{profileStats.present + profileStats.late}</p>
                        </div>
                      </div>

                      <div className="bg-white border border-outline-variant rounded-2xl p-6 flex items-center gap-4 shadow-sm">
                        <div className="p-3 bg-red-50 text-error rounded-lg">
                          <X className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Absent Days</p>
                          <p className="text-2xl font-bold">{profileStats.absent}</p>
                        </div>
                      </div>

                      <div className="bg-white border border-outline-variant rounded-2xl p-6 flex items-center gap-4 shadow-sm">
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
                          <Clock className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Late Days</p>
                          <p className="text-2xl font-bold">{profileStats.late}</p>
                        </div>
                      </div>

                      <div className="bg-white border border-outline-variant rounded-2xl p-6 flex items-center gap-4 shadow-sm border-l-4 border-primary">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Attendance Rate</p>
                          <p className="text-2xl font-bold text-primary">{profileStats.rate}</p>
                        </div>
                        <div className="relative h-12 w-12 shrink-0">
                          <svg className="h-full w-full" viewBox="0 0 36 36">
                            <path
                              className="text-slate-100 stroke-current"
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
                      <div className="bg-white border border-outline-variant rounded-2xl p-6 lg:col-span-1 shadow-sm">
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
                      <div className="bg-white border border-outline-variant rounded-2xl p-6 lg:col-span-2 shadow-sm">
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
                    <section className="bg-white border border-outline-variant rounded-2xl overflow-hidden shadow-sm">
                      <div className="px-6 py-4 border-b border-outline-variant bg-white">
                        <h3 className="font-bold text-lg text-[#0f4c81]">Personal History Logs</h3>
                      </div>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-on-surface-variant text-xs font-semibold uppercase tracking-wider">
                              <th className="px-6 py-3">Date</th>
                              <th className="px-6 py-3">Clock In</th>
                              <th className="px-6 py-3">Clock Out</th>
                              <th className="px-6 py-3">Working Hours</th>
                              <th className="px-6 py-3">Break</th>
                              <th className="px-6 py-3">Extra Hours</th>
                              <th className="px-6 py-3">Break Allowance</th>
                              <th className="px-6 py-3">Productivity</th>
                              <th className="px-6 py-3">Remark</th>
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
                                          className="bg-white border border-outline-variant rounded p-1 text-sm outline-none focus:ring-1 focus:ring-primary w-28"
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
                                          className="bg-white border border-outline-variant rounded p-1 text-sm outline-none focus:ring-1 focus:ring-primary w-28"
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
                                        className="bg-white border border-outline-variant rounded px-2 py-1 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-white"
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
                                    <td className="px-6 py-4">
                                      {isEditing ? (
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="number"
                                            min="0"
                                            value={editExtraHoursHrs}
                                            onChange={(e) => setEditExtraHoursHrs(Math.max(0, parseInt(e.target.value, 10) || 0))}
                                            className="bg-white border border-outline-variant rounded p-1 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary w-11 text-center bg-white"
                                          />
                                          <span className="text-[10px] text-on-surface-variant font-bold">h</span>
                                          <input
                                            type="number"
                                            min="0"
                                            max="59"
                                            value={editExtraHoursMins}
                                            onChange={(e) => setEditExtraHoursMins(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                                            className="bg-white border border-outline-variant rounded p-1 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary w-11 text-center bg-white"
                                          />
                                          <span className="text-[10px] text-on-surface-variant font-bold">m</span>
                                        </div>
                                      ) : (
                                        getExtraHoursStr(log.totalHours) === '0h 00m' ? (
                                          <span className="text-on-surface-variant/40 italic">--</span>
                                        ) : (
                                          getExtraHoursStr(log.totalHours)
                                        )
                                      )}
                                    </td>
                                    <td className="px-6 py-4">
                                      <select
                                        disabled={log.status === 'Absent' || isEditing}
                                        value={getBreakAllowanceMinutes(log.totalHours)}
                                        onChange={(e) => handleUpdateBreakAllowance(log.id, parseInt(e.target.value, 10))}
                                        className="bg-white border border-outline-variant rounded px-2 py-1 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer bg-white"
                                      >
                                        <option value="0">0 mins</option>
                                        <option value="15">15 mins</option>
                                        <option value="45">45 mins</option>
                                        <option value="60">60 mins</option>
                                      </select>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-[#0f4c81]">
                                      {isEditing ? (
                                        getProductiveHoursStr(
                                          calculateDuration(
                                            editStatus === 'Absent' ? '--:--' : time24To12(editClockIn),
                                            editStatus === 'Absent' ? '--:--' : time24To12(editClockOut)
                                          ) + `|${getBreakMinutes(log.totalHours)}|${editRemark.trim()}|${editExtraHoursHrs * 60 + editExtraHoursMins}|${getBreakAllowanceMinutes(log.totalHours)}`
                                        )
                                      ) : (
                                        getProductiveHoursStr(log.totalHours)
                                      )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-on-surface-variant max-w-[180px] truncate">
                                      {isEditing ? (
                                        <input
                                          type="text"
                                          value={editRemark}
                                          onChange={(e) => setEditRemark(e.target.value)}
                                          placeholder="Add remark..."
                                          className="bg-white border border-outline-variant rounded p-1 text-sm outline-none focus:ring-1 focus:ring-primary w-40"
                                        />
                                      ) : (
                                        getRemark(log.totalHours) || <span className="text-on-surface-variant/40 italic">--</span>
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
                                          className="bg-white border border-outline-variant rounded p-1.5 text-xs font-semibold outline-none focus:ring-1 focus:ring-primary"
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
                                             'bg-red-100 text-red-800'
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
                                            className="p-1.5 rounded-full border border-outline-variant text-on-surface-variant hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
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
                                              setEditRemark(getRemark(log.totalHours));
                                              const extraMins = getExtraHoursMinutes(log.totalHours);
                                              setEditExtraHoursHrs(Math.floor(extraMins / 60));
                                              setEditExtraHoursMins(extraMins % 60);
                                            }}
                                            className="p-1.5 rounded-full border border-outline-variant text-primary hover:bg-primary/10 hover:border-primary active:scale-95 transition-all cursor-pointer"
                                          >
                                            <Edit2 className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            title="Delete Attendance Log"
                                            onClick={() => handleDeleteAttendance(log.id)}
                                            className="p-1.5 rounded-full border border-outline-variant text-error hover:bg-red-50 hover:border-error transition-all cursor-pointer"
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
                      <div className="p-4 bg-slate-50 border-t text-center">
                        <button onClick={() => showToast('All logs fully loaded.')} className="font-bold text-sm text-primary hover:underline">
                          View More Months
                        </button>
                      </div>
                    </section>
                  </div>
                )}

                {/* Empty profile fallback when no employee is selected/available */}
                {currentTab === 'Reports' && !selectedEmployeeForProfile && (
                  <div className="bg-white border border-outline-variant rounded-2xl p-12 text-center text-on-surface-variant font-medium shadow-sm">
                    <User className="w-16 h-16 text-outline mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-primary mb-2">No Profile Selected</h3>
                    <p className="text-sm max-w-md mx-auto">
                      Please select an employee from the Dashboard or Users tab to view their detailed reports and history.
                    </p>
                  </div>
                )}

                {/* 6. EMPLOYEE / MANAGER DASHBOARD */}
                {currentTab === 'EmpDashboard' && currentUser && (
                  <div className="space-y-6 animate-fade-in">
                    {/* Welcome banner */}
                    <div className="bg-gradient-to-r from-[#0f4c81] to-[#1e293b] p-6 rounded-2xl text-white shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h1 className="font-bold text-2xl tracking-tight">Welcome back, {currentUser.fullName}!</h1>
                        <p className="text-xs text-white/80 font-medium mt-1">{currentUser.designation} • {currentUser.department} Department</p>
                        {currentUser.managerId && (
                          <div className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1 rounded-full text-[10px] font-bold bg-white/20 text-white backdrop-blur-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            Assigned Team Leader: {users.find(u => u.id === currentUser.managerId)?.fullName || 'Pending'}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-bold text-white/70">Current Session Details:</span>
                        <span className="text-sm font-bold mt-0.5">{currentDateTime}</span>
                      </div>
                    </div>

                    {/* Clock In / Out Banner */}
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                      <div className="space-y-2">
                        <span className="text-xs text-on-surface-variant font-bold uppercase tracking-wider">Attendance Trigger</span>
                        <h3 className="font-bold text-lg text-primary">Daily Clock In & Out</h3>
                        <p className="text-xs text-on-surface-variant font-medium">Record your daily active work times directly into attendance logs.</p>
                      </div>

                      <div className="flex flex-col gap-1 items-center justify-center p-4 bg-surface-container-low/40 rounded-xl border border-outline-variant/30">
                        {(() => {
                          if (currentUser.internType === 'Offline Intern') {
                            return (
                              <>
                                <span className="text-xs font-bold text-on-surface-variant uppercase">Biometric Logging</span>
                                <span className="text-sm font-semibold text-on-surface-variant mt-0.5">Please clock in at the office terminal</span>
                              </>
                            );
                          }
                          const log = attendanceLogs.find(l => l.employeeId === currentUser.employeeId && l.date === todayDateString);
                          if (!log) {
                            return (
                              <>
                                <span className="text-xs font-bold text-red-600 animate-pulse uppercase">Not Clocked In Yet</span>
                                <span className="text-sm font-semibold text-on-surface-variant mt-0.5">Required: Clock in before 12:00 PM</span>
                              </>
                            );
                          } else if (log.clockOut === '--:--') {
                            return (
                              <>
                                <span className="text-xs font-bold text-amber-600 animate-pulse uppercase">Currently Clocked In</span>
                                <span className="text-sm font-bold text-primary mt-0.5">In time: {log.clockIn}</span>
                              </>
                            );
                          } else {
                            return (
                              <>
                                <span className="text-xs font-bold text-emerald-600 uppercase">Shift Completed</span>
                                <span className="text-xs text-on-surface-variant mt-0.5">In: {log.clockIn} • Out: {log.clockOut}</span>
                                <span className="text-xs font-bold text-primary">Duration: {log.totalHours.split('|')[0]}</span>
                              </>
                            );
                          }
                        })()}
                      </div>

                      <div className="flex justify-center">
                        {(() => {
                          if (currentUser.internType === 'Offline Intern') {
                            return (
                              <button
                                disabled
                                className="w-full max-w-[200px] py-4 rounded-xl text-sm font-bold bg-surface-container text-on-surface-variant/45 cursor-not-allowed shadow-none border border-outline-variant/30 flex items-center justify-center gap-2"
                              >
                                <Clock className="w-4 h-4" />
                                Offline Log Only
                              </button>
                            );
                          }
                          const log = attendanceLogs.find(l => l.employeeId === currentUser.employeeId && l.date === todayDateString);
                          const isCompleted = log && log.clockOut !== '--:--';

                          return (
                            <button
                              onClick={handleEmployeeClockToggle}
                              disabled={isCompleted}
                              className={`w-full max-w-[200px] py-4 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer ${
                                isCompleted
                                  ? 'bg-surface-container text-on-surface-variant/40 cursor-not-allowed shadow-none border border-outline-variant/30'
                                  : !log
                                  ? 'bg-primary text-on-primary hover:bg-primary/90'
                                  : 'bg-amber-500 hover:bg-amber-600 text-white'
                              }`}
                            >
                              <Clock className="w-4 h-4" />
                              {!log ? 'Clock In' : isCompleted ? 'Completed' : 'Clock Out'}
                            </button>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Bento metrics */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-white p-4 rounded-xl border border-outline-variant/60 shadow-sm">
                        <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Pending Tasks</p>
                        <p className="text-3xl font-extrabold text-primary mt-1">{employeeStats.pendingTasks}</p>
                        <button onClick={() => setCurrentTab('PendingTasks')} className="text-[10px] text-primary font-bold hover:underline mt-1 cursor-pointer">
                          View Pending Tasks
                        </button>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-outline-variant/60 shadow-sm">
                        <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Completed Tasks</p>
                        <p className="text-3xl font-extrabold text-emerald-600 mt-1">{employeeStats.completedTasks}</p>
                        <button onClick={() => setCurrentTab('CompletedTasks')} className="text-[10px] text-emerald-600 font-bold hover:underline mt-1 cursor-pointer">
                          View History Board
                        </button>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-outline-variant/60 shadow-sm">
                        <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Approved Leaves</p>
                        <p className="text-3xl font-extrabold text-indigo-600 mt-1">{employeeStats.approvedLeaves}</p>
                        <p className="text-[11px] text-on-surface-variant/80 font-medium mt-1">Total: {employeeStats.totalLeavesDays} days</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Top Tasks list */}
                      <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="font-bold text-sm text-primary uppercase tracking-wider">Urgent Active Tasks</h3>
                          <button
                            onClick={() => setCurrentTab('MyTasks')}
                            className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                          >
                            All Tasks
                          </button>
                        </div>

                        <div className="divide-y divide-outline-variant/10">
                          {tasks.filter(t => t.userId === currentUser.id && t.status !== 'Completed').slice(0, 3).length === 0 ? (
                            <p className="py-6 text-center text-xs text-on-surface-variant font-semibold">No pending tasks. Great job!</p>
                          ) : (
                            tasks.filter(t => t.userId === currentUser.id && t.status !== 'Completed').slice(0, 3).map(t => (
                              <div key={t.id} className="py-3 flex justify-between items-center">
                                <div>
                                  <p className="font-bold text-sm text-on-surface">{t.title}</p>
                                  <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">Due: {formatDeadline(t.deadline)}</p>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  t.priority === 'High' ? 'bg-red-50 text-error' : t.priority === 'Medium' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
                                }`}>
                                  {t.priority}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Recent Alerts Feed */}
                      <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-4">
                        <h3 className="font-bold text-sm text-primary uppercase tracking-wider">Activity & Notifications</h3>
                        <div className="divide-y divide-outline-variant/10 max-h-[220px] overflow-y-auto pr-1">
                          {notifications.filter(n => n.userId === currentUser.id).slice(0, 4).length === 0 ? (
                            <p className="py-8 text-center text-xs text-on-surface-variant font-semibold">No recent activity logs.</p>
                          ) : (
                            notifications.filter(n => n.userId === currentUser.id).slice(0, 4).map(n => (
                              <div key={n.id} className="py-3 flex gap-2 items-start">
                                <span className={`w-2 h-2 mt-1.5 rounded-full ${n.isRead ? 'bg-on-surface-variant/30' : 'bg-primary animate-pulse'}`}></span>
                                <div>
                                  <p className="font-semibold text-xs text-on-surface">{n.title}</p>
                                  <p className="text-[11px] text-on-surface-variant leading-relaxed mt-0.5">{n.message}</p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 6.5. TEAM LEADER DASHBOARD */}
                {currentTab === 'TeamLeaderDashboard' && currentUser && currentUser.role === 'Team Leader' && (
                  <div className="space-y-6 animate-fade-in">
                    {/* Welcome Banner */}
                    <div className="bg-gradient-to-r from-teal-700 to-slate-800 p-6 rounded-2xl text-white shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h1 className="font-bold text-2xl tracking-tight">Team Leader Dashboard</h1>
                        <p className="text-xs text-white/80 font-medium mt-1">Manage assigned interns, create tasks, and review completions</p>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-bold text-white/70">Current Session Details:</span>
                        <span className="text-sm font-bold mt-0.5">{currentDateTime}</span>
                      </div>
                    </div>

                    {/* Assigned Interns Section */}
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-6">
                      <div>
                        <h2 className="font-bold text-lg text-primary">Your Assigned Interns</h2>
                        <p className="text-xs text-on-surface-variant font-medium">Assigned interns under your direct leadership.</p>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-outline-variant/40 bg-surface-container-low/20">
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Intern Name</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Email</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Intern Type</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Status</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {users.filter(u => u.managerId === currentUser.id).length === 0 ? (
                              <tr>
                                <td colSpan={5} className="py-6 text-center text-on-surface-variant/70 font-medium">
                                  No interns assigned to you yet. Admin can assign them under your profile in the <strong className="text-primary">User Management</strong> section.
                                </td>
                              </tr>
                            ) : (
                              users.filter(u => u.managerId === currentUser.id).map(intern => {
                                const avatar = employees.find(e => e.id === intern.employeeId)?.avatarUrl;
                                return (
                                  <tr key={intern.id} className="hover:bg-primary/5 transition-colors">
                                    <td className="py-3 px-4">
                                      <div className="flex items-center gap-3">
                                        {avatar ? (
                                          <img src={avatar} alt={intern.fullName} className="w-8 h-8 rounded-full object-cover border border-outline-variant" />
                                        ) : (
                                          <div className="w-8 h-8 rounded-full border border-primary/20 bg-primary/5 flex items-center justify-center text-primary font-bold">
                                            {intern.fullName.charAt(0)}
                                          </div>
                                        )}
                                        <div>
                                          <p className="font-bold text-primary">{intern.fullName}</p>
                                          <p className="text-[10px] text-on-surface-variant font-medium">@{intern.username}</p>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-3 px-4 font-semibold text-on-surface-variant">{intern.email}</td>
                                    <td className="py-3 px-4">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                                        intern.internType === 'Online Intern'
                                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                                          : 'bg-orange-50 text-orange-700 border-orange-200'
                                      }`}>
                                        {intern.internType || 'Online Intern'}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4">
                                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                                        intern.status === 'Active'
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : 'bg-red-50 text-red-700 border-red-200'
                                      }`}>
                                        {intern.status}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4">
                                      <button
                                        onClick={() => {
                                          setNewTaskTitle('');
                                          setNewTaskDesc('');
                                          setNewTaskPriority('Medium');
                                          setNewTaskDeadline(getDefaultDeadlineString());
                                          setNewTaskAttachment('');
                                          setNewTaskAssigneeId(intern.id);
                                          setIsAddTaskModalOpen(true);
                                        }}
                                        className="inline-flex items-center gap-1 bg-primary hover:bg-primary/90 text-on-primary px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm cursor-pointer"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        Create Task
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Intern Completed Tasks Section */}
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-6">
                      <div>
                        <h2 className="font-bold text-lg text-emerald-700">Completed Tasks by Interns</h2>
                        <p className="text-xs text-on-surface-variant font-medium">Review deliverables and completion documentation uploaded by your interns.</p>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-outline-variant/40 bg-surface-container-low/20">
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Intern Name</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Task Title</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Description</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Attachment / Deliverable</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Completed At</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {(() => {
                              const myInternIds = users.filter(u => u.managerId === currentUser.id).map(u => u.id);
                              const completedInternTasks = tasks.filter(t => myInternIds.includes(t.userId) && t.status === 'Completed');

                              if (completedInternTasks.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan={5} className="py-6 text-center text-on-surface-variant/70 font-medium">
                                      No completed tasks by your interns yet.
                                    </td>
                                  </tr>
                                );
                              }

                              return completedInternTasks.map(t => {
                                const intern = users.find(u => u.id === t.userId);
                                return (
                                  <tr key={t.id} className="hover:bg-primary/5 transition-colors">
                                    <td className="py-3 px-4">
                                      <p className="font-bold text-primary">{intern ? intern.fullName : 'Unknown Intern'}</p>
                                      <p className="text-[10px] text-on-surface-variant">@{intern?.username}</p>
                                    </td>
                                    <td className="py-3 px-4 font-bold text-on-surface">{t.title}</td>
                                    <td className="py-3 px-4 font-semibold text-on-surface-variant max-w-xs truncate">{t.description || '-'}</td>
                                    <td className="py-3 px-4 font-medium">
                                      {t.attachment ? (
                                        <a
                                          href={t.attachment.startsWith('http') ? t.attachment : `https://${t.attachment}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1 text-primary hover:underline font-bold"
                                        >
                                          <FileText className="w-3.5 h-3.5" />
                                          View Attachment
                                        </a>
                                      ) : (
                                        <span className="text-[10px] text-on-surface-variant/60 italic">No document attached</span>
                                      )}
                                    </td>
                                    <td className="py-3 px-4 font-bold text-emerald-700">
                                      {t.completedAt ? new Date(t.completedAt).toLocaleDateString() : 'Just now'}
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Intern Completed Work Summaries (Task Done) */}
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <h2 className="font-bold text-lg text-emerald-700 flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-emerald-600" />
                            Intern Completed Work Summaries (Task Done)
                          </h2>
                          <p className="text-xs text-on-surface-variant font-medium">Review the daily work reports and tasks submitted by your assigned interns upon clocking out.</p>
                        </div>
                        
                        {/* Filters */}
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                            <input
                              type="text"
                              placeholder="Filter by name / work..."
                              value={tlTaskDoneSearch}
                              onChange={(e) => setTlTaskDoneSearch(e.target.value)}
                              className="bg-surface-container-low border border-outline-variant rounded-full pl-9 pr-4 py-1.5 text-xs text-on-surface focus:outline-none"
                            />
                          </div>
                          <input
                            type="date"
                            value={tlTaskDoneDate}
                            onChange={(e) => setTlTaskDoneDate(e.target.value)}
                            className="bg-surface-container-low border border-outline-variant rounded-full px-3.5 py-1.5 text-xs text-on-surface focus:outline-none"
                          />
                          {tlTaskDoneDate && (
                            <button
                              onClick={() => setTlTaskDoneDate('')}
                              className="text-xs text-primary font-bold hover:underline cursor-pointer"
                            >
                              Clear Date
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-outline-variant/40 bg-surface-container-low/20">
                              <th className="py-2.5 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Date</th>
                              <th className="py-2.5 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Intern Name</th>
                              <th className="py-2.5 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Intern Type</th>
                              <th className="py-2.5 px-3 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Work Summary</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {(() => {
                              // Filter interns managed by this TL
                              const myInternIds = users.filter(u => u.managerId === currentUser.id).map(u => u.id);
                              
                              // Filter completed tasks by my interns
                              const completedTasks = tasks.filter(t => myInternIds.includes(t.userId) && t.status === 'Completed');
                              
                              // Filter by search term (employee name or description)
                              const filtered = completedTasks.filter(t => {
                                const employeeUser = users.find(u => u.id === t.userId);
                                const empName = employeeUser ? employeeUser.fullName.toLowerCase() : '';
                                const desc = t.description ? t.description.toLowerCase() : '';
                                const title = t.title ? t.title.toLowerCase() : '';
                                
                                const matchesSearch = empName.includes(tlTaskDoneSearch.toLowerCase()) ||
                                  desc.includes(tlTaskDoneSearch.toLowerCase()) ||
                                  title.includes(tlTaskDoneSearch.toLowerCase());
                                  
                                let matchesDate = true;
                                if (tlTaskDoneDate) {
                                  const completedDateStr = t.completedAt ? new Date(t.completedAt).toISOString().split('T')[0] : '';
                                  const deadlineDateStr = t.deadline ? t.deadline.split('T')[0] : '';
                                  matchesDate = completedDateStr === tlTaskDoneDate || deadlineDateStr === tlTaskDoneDate;
                                }
                                
                                return matchesSearch && matchesDate;
                              });

                              if (filtered.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan={4} className="py-6 text-center text-on-surface-variant/70 font-medium">
                                      No completed work summaries found for your assigned interns.
                                    </td>
                                  </tr>
                                );
                              }

                              // Sort by completedAt descending
                              const sorted = filtered.sort((a, b) => {
                                const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
                                const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
                                return timeB - timeA;
                              });

                              return sorted.map(t => {
                                const intern = users.find(u => u.id === t.userId);
                                const emp = employees.find(e => e.id === intern?.employeeId);
                                const dateFormatted = t.completedAt ? new Date(t.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date';
                                return (
                                  <tr key={t.id} className="hover:bg-primary/5 transition-colors">
                                    <td className="py-3 px-3 font-bold text-on-surface whitespace-nowrap">{dateFormatted}</td>
                                    <td className="py-3 px-3">
                                      <div className="flex items-center gap-3">
                                        {emp?.avatarUrl ? (
                                          <img src={emp.avatarUrl} alt={intern?.fullName} className="w-7 h-7 rounded-full object-cover border border-outline-variant" />
                                        ) : (
                                          <div className="w-7 h-7 rounded-full border border-primary/20 bg-primary/5 flex items-center justify-center text-primary font-bold">
                                            {intern?.fullName?.charAt(0)}
                                          </div>
                                        )}
                                        <div>
                                          <p className="font-bold text-primary">{intern?.fullName || 'Unknown Intern'}</p>
                                          <p className="text-[10px] text-on-surface-variant font-medium">@{intern?.username}</p>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-3 px-3">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                                        intern?.internType === 'Online Intern'
                                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                                          : 'bg-orange-50 text-orange-700 border-orange-200'
                                      }`}>
                                        {intern?.internType || 'Online Intern'}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 max-w-md font-medium text-on-surface-variant">
                                      <p className="font-bold text-primary text-[11px] mb-0.5">{t.title}</p>
                                      <p className="text-on-surface text-xs leading-relaxed whitespace-pre-line">{t.description}</p>
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* 7. EMPLOYEE TASKS BOARD */}
                {(currentTab === 'MyTasks' || currentTab === 'PendingTasks' || currentTab === 'CompletedTasks') && currentUser && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-6">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <h2 className="font-bold text-lg text-primary">
                            {currentTab === 'MyTasks' ? 'My Taskboard' : currentTab === 'PendingTasks' ? 'Pending Tasks' : 'Completed Tasks'}
                          </h2>
                          <p className="text-xs text-on-surface-variant font-medium">View assignments, update status transitions ({"Pending -> In Progress -> Completed"}), upload document attachments.</p>
                        </div>
                        <button
                          onClick={() => {
                            setNewTaskTitle('');
                            setNewTaskDesc('');
                            setNewTaskPriority('Medium');
                            setNewTaskDeadline(getDefaultDeadlineString());
                            setNewTaskAssigneeId(currentUser.id);
                            setNewTaskAttachment('');
                            setIsAddTaskModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-on-primary px-4 py-2 rounded-full text-xs font-semibold shadow-sm transition-all cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          Create Task
                        </button>
                      </div>

                      {/* Filters */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-surface-container-low/40 rounded-xl border border-outline-variant/30">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                          <input
                            type="text"
                            placeholder="Filter task title..."
                            value={taskSearchTerm}
                            onChange={(e) => setTaskSearchTerm(e.target.value)}
                            className="w-full bg-white border border-outline-variant rounded-lg pl-9 pr-3 py-1.5 text-xs text-on-surface focus:outline-none"
                          />
                        </div>

                        <div>
                          <select
                            value={taskPriorityFilter}
                            onChange={(e) => setTaskPriorityFilter(e.target.value)}
                            className="w-full bg-white border border-outline-variant rounded-lg px-3 py-1.5 text-xs text-on-surface focus:outline-none"
                          >
                            <option value="All">All Priorities</option>
                            <option value="High">High Priority</option>
                            <option value="Medium">Medium Priority</option>
                            <option value="Low">Low Priority</option>
                          </select>
                        </div>
                      </div>

                      {/* Task cards Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {myFilteredTasks.length === 0 ? (
                          <div className="col-span-full py-12 text-center text-xs text-on-surface-variant font-medium">
                            No tasks found matching criteria.
                          </div>
                        ) : (
                          myFilteredTasks.map((t) => (
                            <div key={t.id} className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant shadow-sm flex flex-col justify-between space-y-4 hover:border-primary/30 transition-all">
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                                    t.priority === 'High'
                                      ? 'bg-red-50 text-error border-red-200'
                                      : t.priority === 'Medium'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-blue-50 text-blue-700 border-blue-200'
                                  }`}>
                                    {t.priority} Priority
                                  </span>

                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                                    t.status === 'Completed'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : t.status === 'In Progress'
                                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse'
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                                  }`}>
                                    {t.status}
                                  </span>
                                </div>

                                <h3 className="font-bold text-sm text-primary leading-tight">{t.title}</h3>
                                {t.description && <p className="text-xs text-on-surface-variant/90 leading-relaxed font-medium">{t.description}</p>}
                              </div>

                              <div className="space-y-3 pt-3 border-t border-outline-variant/20">
                                <div className="flex flex-col gap-1.5 text-[10px] text-on-surface-variant font-semibold">
                                  <div className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-on-surface-variant" />
                                    <span>Deadline: {formatDeadline(t.deadline)}</span>
                                  </div>
                                  {t.status === 'Completed' && t.completedAt && (
                                    <div className="flex items-center gap-1 text-emerald-700 font-bold">
                                      <CheckCircle className="w-3 h-3 text-emerald-600" />
                                      <span>Completed: {new Date(t.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    </div>
                                  )}
                                </div>

                                {t.attachment && (
                                  <a
                                    href={t.attachment}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
                                  >
                                    <Paperclip className="w-3.5 h-3.5" />
                                    Download document attachment
                                  </a>
                                )}

                                {/* Status Transitions */}
                                <div className="flex items-center gap-1.5 pt-1">
                                  {t.status === 'Pending' && (
                                    <button
                                      onClick={() => handleUpdateTaskStatus(t, 'In Progress')}
                                      className="flex-1 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded border border-indigo-200/50 cursor-pointer"
                                    >
                                      Start Working
                                    </button>
                                  )}
                                  {t.status === 'In Progress' && (
                                    <>
                                      <button
                                        onClick={() => handleUpdateTaskStatus(t, 'Completed')}
                                        className="flex-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded border border-emerald-200/50 cursor-pointer"
                                      >
                                        Mark Completed
                                      </button>
                                      <button
                                        onClick={() => handleUpdateTaskStatus(t, 'Pending')}
                                        className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-on-surface-variant text-[10px] font-bold rounded border border-outline-variant/30 cursor-pointer"
                                      >
                                        Revert
                                      </button>
                                    </>
                                  )}
                                  {t.status === 'Completed' && (
                                    <button
                                      onClick={() => handleUpdateTaskStatus(t, 'Pending')}
                                      className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-on-surface-variant text-[10px] font-bold rounded border border-outline-variant/30 cursor-pointer"
                                    >
                                      Reopen Task
                                    </button>
                                  )}
                                  <button
                                    onClick={() => deleteTask(t.id)}
                                    className="p-1.5 hover:bg-red-50 hover:text-error text-on-surface-variant rounded border border-outline-variant/30 cursor-pointer"
                                    title="Delete task assignment"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 8. EMPLOYEE LEAVE APPLICATIONS */}
                {currentTab === 'LeaveRequests' && currentUser && (
                  <div className="space-y-6 animate-fade-in">
                    {/* Apply Leave request Form */}
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-6">
                      <div>
                        <h2 className="font-bold text-lg text-primary">Apply for Leave</h2>
                        <p className="text-xs text-on-surface-variant font-medium">Select your dates, type, reason and optionally add attachment documentation.</p>
                      </div>

                      <form onSubmit={handleLeaveRequestSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Leave Type</label>
                          <select
                            value={leaveType}
                            onChange={(e) => setLeaveType(e.target.value as any)}
                            className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                          >
                            <option value="Casual">Casual Leave</option>
                            <option value="Sick">Sick Leave</option>
                            <option value="Emergency">Emergency Leave</option>
                            <option value="Work From Home">Work From Home (WFH)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Attachment URL (Optional)</label>
                          <input
                            type="text"
                            value={leaveAttachment}
                            onChange={(e) => setLeaveAttachment(e.target.value)}
                            placeholder="Link to document..."
                            className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">From Date</label>
                          <input
                            type="date"
                            value={leaveFromDate}
                            onChange={(e) => setLeaveFromDate(e.target.value)}
                            className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">To Date</label>
                          <input
                            type="date"
                            value={leaveToDate}
                            onChange={(e) => setLeaveToDate(e.target.value)}
                            className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Brief Reason</label>
                          <input
                            type="text"
                            value={leaveReason}
                            onChange={(e) => setLeaveReason(e.target.value)}
                            placeholder="e.g. Medical checkup, personal work"
                            className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Detailed Description</label>
                          <textarea
                            value={leaveDesc}
                            onChange={(e) => setLeaveDesc(e.target.value)}
                            placeholder="Provide additional details..."
                            rows={3}
                            className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                          />
                        </div>

                        <div className="sm:col-span-2 flex justify-end pt-2">
                          <button
                            type="submit"
                            className="bg-primary hover:bg-primary/90 text-on-primary px-6 py-2.5 rounded-full text-xs font-bold shadow-sm transition-all cursor-pointer"
                          >
                            Submit Leave Application
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* History Timeline table */}
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-4">
                      <h3 className="font-bold text-sm text-primary uppercase tracking-wider">Leave Applications History</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-outline-variant/40 bg-surface-container-low/20">
                              <th className="py-2.5 px-3 font-bold text-xs text-on-surface-variant">Leave Type</th>
                              <th className="py-2.5 px-3 font-bold text-xs text-on-surface-variant">Dates Range</th>
                              <th className="py-2.5 px-3 font-bold text-xs text-on-surface-variant">Total Days</th>
                              <th className="py-2.5 px-3 font-bold text-xs text-on-surface-variant">Reason</th>
                              <th className="py-2.5 px-3 font-bold text-xs text-on-surface-variant">Status</th>
                              <th className="py-2.5 px-3 font-bold text-xs text-on-surface-variant">Feedback</th>
                            </tr>
                          </thead>
                          <tbody>
                            {leaveRequests.filter(l => l.userId === currentUser.id).length === 0 ? (
                              <tr>
                                <td colSpan={6} className="py-6 text-center text-xs text-on-surface-variant font-medium">
                                  No leave applications recorded.
                                </td>
                              </tr>
                            ) : (
                              leaveRequests.filter(l => l.userId === currentUser.id).map(l => (
                                <tr key={l.id} className="hover:bg-primary/5 text-xs">
                                  <td className="py-3 px-3 font-bold text-primary">{l.leaveType}</td>
                                  <td className="py-3 px-3 text-on-surface-variant">{l.fromDate} to {l.toDate}</td>
                                  <td className="py-3 px-3 font-semibold text-primary">{l.totalDays} days</td>
                                  <td className="py-3 px-3 text-on-surface-variant font-medium">"{l.reason}"</td>
                                  <td className="py-3 px-3">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                                      l.status === 'Approved'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : l.status === 'Rejected'
                                        ? 'bg-red-50 text-red-700 border-red-200'
                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                    }`}>
                                      {l.status}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 font-semibold text-on-surface-variant/80 italic">
                                    {l.adminComment ? `"${l.adminComment}"` : '--'}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* 8.5. TASK DONE (ONLINE INTERN COMPLETED WORK SUMMARIES) */}
                {currentTab === 'TaskDone' && (currentUser?.role === 'Admin' || currentUser?.role === 'Team Leader') && (
                  <div className="space-y-6 animate-fade-in">
                    {/* Welcome Banner */}
                    <div className="bg-gradient-to-r from-emerald-800 to-teal-950 p-6 rounded-2xl text-white shadow-md">
                      <h1 className="font-bold text-2xl tracking-tight">Online Intern Task Done Console</h1>
                      <p className="text-xs text-white/80 font-medium mt-1">Review the daily work reports and tasks submitted by online interns upon clocking out.</p>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-6">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <h2 className="font-bold text-lg text-primary flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-emerald-600" />
                            Completed Daily Work Summaries
                          </h2>
                          <p className="text-xs text-on-surface-variant font-medium">Browse task completions date-wise for active online interns.</p>
                        </div>
                        
                        {/* Filters */}
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                            <input
                              type="text"
                              placeholder="Filter by name / work..."
                              value={adminTaskDoneSearch}
                              onChange={(e) => setAdminTaskDoneSearch(e.target.value)}
                              className="bg-surface-container-low border border-outline-variant rounded-full pl-9 pr-4 py-1.5 text-xs text-on-surface focus:outline-none"
                            />
                          </div>
                          <input
                            type="date"
                            value={adminTaskDoneDate}
                            onChange={(e) => setAdminTaskDoneDate(e.target.value)}
                            className="bg-surface-container-low border border-outline-variant rounded-full px-3.5 py-1.5 text-xs text-on-surface focus:outline-none"
                          />
                          {adminTaskDoneDate && (
                            <button
                              onClick={() => setAdminTaskDoneDate('')}
                              className="text-xs text-primary font-bold hover:underline cursor-pointer"
                            >
                              Clear Date
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-outline-variant/40 bg-surface-container-low/20">
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Date</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Intern Name</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Designation / Intern Type</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Work Summary</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">Attendance Status</th>
                              <th className="py-3 px-4 font-bold text-xs text-on-surface-variant uppercase tracking-wider">In/Out Times</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {(() => {
                              // Filter completed tasks
                              const completedTasks = tasks.filter(t => t.status === 'Completed');
                              
                              // Filter by search, date, and specifically for Online Interns!
                              const filtered = completedTasks.filter(t => {
                                const employeeUser = users.find(u => u.id === t.userId);
                                
                                // Show only if employeeUser is an Online Intern
                                if (employeeUser?.internType !== 'Online Intern') return false;
                                
                                // For Team Leaders, show only interns assigned under them
                                if (currentUser?.role === 'Team Leader' && employeeUser.managerId !== currentUser.id) {
                                  return false;
                                }

                                const empName = employeeUser ? employeeUser.fullName.toLowerCase() : '';
                                const desc = t.description ? t.description.toLowerCase() : '';
                                const title = t.title ? t.title.toLowerCase() : '';
                                
                                const matchesSearch = empName.includes(adminTaskDoneSearch.toLowerCase()) ||
                                  desc.includes(adminTaskDoneSearch.toLowerCase()) ||
                                  title.includes(adminTaskDoneSearch.toLowerCase());
                                  
                                let matchesDate = true;
                                if (adminTaskDoneDate) {
                                  const completedDateStr = t.completedAt ? new Date(t.completedAt).toISOString().split('T')[0] : '';
                                  const deadlineDateStr = t.deadline ? t.deadline.split('T')[0] : '';
                                  matchesDate = completedDateStr === adminTaskDoneDate || deadlineDateStr === adminTaskDoneDate;
                                }
                                
                                return matchesSearch && matchesDate;
                              });

                              if (filtered.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan={6} className="py-6 text-center text-on-surface-variant/70 font-medium">
                                      No completed work summaries found for online interns.
                                    </td>
                                  </tr>
                                );
                              }

                              // Sort by completedAt descending
                              const sorted = filtered.sort((a, b) => {
                                const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
                                const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
                                return timeB - timeA;
                              });

                              return sorted.map(t => {
                                const employeeUser = users.find(u => u.id === t.userId);
                                const emp = employees.find(e => e.id === employeeUser?.employeeId);
                                const dateFormatted = t.completedAt ? new Date(t.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date';
                                
                                // Fetch attendance log for this date
                                const completedDateStr = t.completedAt ? new Date(t.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                                const log = attendanceLogs.find(l => l.employeeId === emp?.id && l.date === completedDateStr);
                                const attendanceStatus = log ? log.status : '--';
                                const clockIn = log ? log.clockIn : '--:--';
                                const clockOut = log ? log.clockOut : '--:--';

                                return (
                                  <tr key={t.id} className="hover:bg-primary/5 transition-colors">
                                    <td className="py-3 px-4 font-bold text-on-surface whitespace-nowrap">{dateFormatted}</td>
                                    <td className="py-3 px-4">
                                      <div className="flex items-center gap-3">
                                        {emp?.avatarUrl ? (
                                          <img src={emp.avatarUrl} alt={employeeUser?.fullName} className="w-8 h-8 rounded-full object-cover border border-outline-variant" />
                                        ) : (
                                          <div className="w-8 h-8 rounded-full border border-primary/20 bg-primary/5 flex items-center justify-center text-primary font-bold">
                                            {employeeUser?.fullName?.charAt(0)}
                                          </div>
                                        )}
                                        <div>
                                          <p className="font-bold text-primary">{employeeUser?.fullName || 'Unknown Intern'}</p>
                                          <p className="text-[10px] text-on-surface-variant font-medium">@{employeeUser?.username}</p>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-3 px-4 whitespace-nowrap">
                                      <p className="text-on-surface-variant font-semibold">{employeeUser?.designation || 'Intern'}</p>
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border bg-blue-50 text-blue-700 border-blue-200 mt-0.5">
                                        {employeeUser?.internType || 'Online Intern'}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4 max-w-md font-medium text-on-surface-variant">
                                      <p className="font-bold text-primary text-[11px] mb-0.5">{t.title}</p>
                                      <p className="text-on-surface text-xs leading-relaxed whitespace-pre-line">{t.description}</p>
                                    </td>
                                    <td className="py-3 px-4">
                                      {attendanceStatus !== '--' ? (
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                                          attendanceStatus === 'Present'
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : attendanceStatus === 'Late'
                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                            : 'bg-red-50 text-red-700 border-red-200'
                                        }`}>
                                          {attendanceStatus}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-on-surface-variant/60 italic">No attendance log</span>
                                      )}
                                    </td>
                                    <td className="py-3 px-4 text-on-surface font-semibold whitespace-nowrap">
                                      <div className="flex flex-col gap-0.5">
                                        <span>In: <strong className="text-primary">{clockIn}</strong></span>
                                        <span>Out: <strong className="text-primary">{clockOut}</strong></span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* 9. EMPLOYEE APPROVED LEAVES VIEW */}
                {currentTab === 'ApprovedLeaves' && currentUser && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-6">
                      <div>
                        <h2 className="font-bold text-lg text-primary">Approved Leave Days</h2>
                        <p className="text-xs text-on-surface-variant font-medium">View all your leave requests that have been approved by administration.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {leaveRequests.filter(l => l.userId === currentUser.id && l.status === 'Approved').length === 0 ? (
                          <div className="col-span-full py-8 text-center text-xs text-on-surface-variant font-medium">
                            No approved leaves found.
                          </div>
                        ) : (
                          leaveRequests.filter(l => l.userId === currentUser.id && l.status === 'Approved').map(l => (
                            <div key={l.id} className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-4 flex gap-3.5 items-start">
                              <CalendarClock className="w-8 h-8 text-emerald-600 shrink-0" />
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">{l.leaveType}</span>
                                <h4 className="font-bold text-sm text-primary pt-1">{l.fromDate} to {l.toDate}</h4>
                                <p className="text-xs text-on-surface-variant font-semibold">Total Days: <strong className="text-primary">{l.totalDays}</strong></p>
                                <p className="text-xs text-on-surface-variant font-medium italic mt-1">"{l.reason}"</p>
                                {l.adminComment && (
                                  <p className="text-[11px] text-on-surface-variant/70 pt-1 border-t border-outline-variant/20 mt-2">
                                    <strong>Admin Feedback:</strong> "{l.adminComment}"
                                  </p>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 10. EMPLOYEE PROFILE */}
                {currentTab === 'EmpProfile' && selectedEmployeeForProfile && (
                  <div className="space-y-6 animate-fade-in">
                    {/* Reuse Admin analytics component scoped to current user */}
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm space-y-6">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-outline-variant/20 pb-4">
                        <div className="flex items-center gap-4">
                          <img src={selectedEmployeeForProfile.avatarUrl} alt={selectedEmployeeForProfile.name} className="w-16 h-16 rounded-full object-cover border border-outline-variant" />
                          <div>
                            <h2 className="font-bold text-xl text-primary">{selectedEmployeeForProfile.name}</h2>
                            <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wider">{selectedEmployeeForProfile.role} • Corporate ID: {selectedEmployeeForProfile.empId}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setIsProfileExportModalOpen(true)}
                          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-on-primary px-4 py-2 rounded-full text-xs font-semibold shadow-sm transition-all cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Export My Records
                        </button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                        <div className="bg-surface-container-low/30 p-4 rounded-xl border border-outline-variant/40">
                          <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Attendance Rate</p>
                          <p className="text-2xl font-extrabold text-primary mt-1">{profileStats.rate}</p>
                          <p className="text-[10px] text-on-surface-variant/80 font-medium">Calculated from {profileStats.total} logs</p>
                        </div>

                        <div className="bg-surface-container-low/30 p-4 rounded-xl border border-outline-variant/40">
                          <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Present Count</p>
                          <p className="text-2xl font-extrabold text-emerald-600 mt-1">{profileStats.present + profileStats.late}</p>
                          <p className="text-[10px] text-on-surface-variant/80 font-medium">On-time days</p>
                        </div>

                        <div className="bg-surface-container-low/30 p-4 rounded-xl border border-outline-variant/40">
                          <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Late Arrivals</p>
                          <p className="text-2xl font-extrabold text-amber-500 mt-1">{profileStats.late}</p>
                          <p className="text-[10px] text-on-surface-variant/80 font-medium">Check-ins after 12:00 PM</p>
                        </div>

                        <div className="bg-surface-container-low/30 p-4 rounded-xl border border-outline-variant/40">
                          <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Absent Days</p>
                          <p className="text-2xl font-extrabold text-error mt-1">{profileStats.absent}</p>
                          <p className="text-[10px] text-on-surface-variant/80 font-medium">Unexcused inactive days</p>
                        </div>
                      </div>

                      {/* Chart visualization */}
                      <div className="space-y-4 pt-4 border-t border-outline-variant/20">
                        <div className="flex justify-between items-center">
                          <h3 className="font-bold text-sm text-primary uppercase tracking-wider">My Attendance & hours trend</h3>
                          <div className="flex items-center gap-1.5 p-1 bg-surface-container-low rounded-lg">
                            <button
                              onClick={() => setTrendFilter('weekly')}
                              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${trendFilter === 'weekly' ? 'bg-white text-primary shadow-xs' : 'text-on-surface-variant'}`}
                            >
                              Weekly
                            </button>
                            <button
                              onClick={() => setTrendFilter('monthly')}
                              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${trendFilter === 'monthly' ? 'bg-white text-primary shadow-xs' : 'text-on-surface-variant'}`}
                            >
                              Monthly
                            </button>
                          </div>
                        </div>

                        <div className="h-48 flex items-end justify-between gap-3 pt-6 border-b border-outline-variant/40">
                          {chartData.map((item, index) => {
                            const heightPct = item.total > 0 ? (item.presentPercent + item.latePercent) : 0;
                            const hoursPct = (item.avgWorkingHours / maxHoursScale) * 100;

                            return (
                              <div key={index} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                                <div className="w-full flex justify-center gap-1 h-full items-end relative">
                                  <div
                                    style={{ height: `${heightPct}%` }}
                                    className="w-4 sm:w-6 bg-primary/20 group-hover:bg-primary/45 rounded-t transition-all"
                                  ></div>
                                  <div
                                    style={{ height: `${hoursPct}%` }}
                                    className="w-2 sm:w-3 bg-emerald-500 rounded-t transition-all"
                                    title={`Hours: ${item.avgWorkingHours.toFixed(1)}h`}
                                  ></div>
                                </div>
                                <span className="text-[10px] text-on-surface-variant font-bold truncate max-w-[40px]">{item.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 11. EMPLOYEE SETTINGS */}
                {currentTab === 'EmpSettings' && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/60 shadow-sm max-w-md mx-auto space-y-6">
                      <div>
                        <h2 className="font-bold text-lg text-primary">Security Settings</h2>
                        <p className="text-xs text-on-surface-variant font-medium">Change your current login account password details.</p>
                      </div>

                      <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Old Password</label>
                          <input
                            type="password"
                            value={settingsOldPass}
                            onChange={(e) => setSettingsOldPass(e.target.value)}
                            placeholder="Enter current password"
                            className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">New Password</label>
                          <input
                            type="password"
                            value={settingsNewPass}
                            onChange={(e) => setSettingsNewPass(e.target.value)}
                            placeholder="Enter new password"
                            className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Confirm New Password</label>
                          <input
                            type="password"
                            value={settingsConfirmPass}
                            onChange={(e) => setSettingsConfirmPass(e.target.value)}
                            placeholder="Confirm new password"
                            className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                          />
                        </div>

                        <button
                          type="submit"
                          className="w-full bg-primary hover:bg-primary/90 text-on-primary py-2.5 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
                        >
                          Update Account Password
                        </button>
                      </form>
                    </div>
                  </div>
                )}

                {/* 12. TEAM CHAT VIEW */}
                {currentTab === 'TeamChat' && currentUser && (
                  <div className="bg-white rounded-2xl border border-outline-variant/60 shadow-sm flex flex-col md:flex-row h-[calc(100vh-170px)] overflow-hidden animate-fade-in">
                    {/* Chat Sidebar / Channels List */}
                    <div className="w-full md:w-80 border-r border-outline-variant/40 flex flex-col bg-surface-container-low/10">
                      <div className="p-4 border-b border-outline-variant/40 bg-gradient-to-r from-[#1b365d] to-[#0b2046] text-white">
                        <h3 className="font-bold text-sm">Team Messages</h3>
                        <p className="text-[10px] text-white/70">Connect with your team members</p>
                      </div>

                      {/* User List */}
                      <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {currentUser.role === 'Employee' ? (
                          (() => {
                            const tl = users.find(u => u.id === currentUser.managerId);
                            if (!tl) {
                              return (
                                <div className="text-center p-4 text-xs text-on-surface-variant/70 font-medium">
                                  No Team Leader assigned to you yet.
                                </div>
                              );
                            }
                            const isSelected = activeChatUserId === tl.id;
                            const avatar = employees.find(e => e.id === tl.employeeId)?.avatarUrl;
                            return (
                              <button
                                onClick={() => {
                                  setActiveChatUserId(tl.id);
                                  fetchChatMessages();
                                }}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                                  isSelected
                                    ? 'bg-primary/10 text-primary border border-primary/20 font-semibold'
                                    : 'hover:bg-surface-container-low text-on-surface-variant'
                                }`}
                              >
                                {avatar ? (
                                  <img src={avatar} alt={tl.fullName} className="w-9 h-9 rounded-full object-cover border border-outline-variant" />
                                ) : (
                                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                                    {tl.fullName.charAt(0)}
                                  </div>
                                )}
                                <div className="truncate">
                                  <p className="text-xs font-bold">{tl.fullName}</p>
                                  <p className="text-[9px] text-on-surface-variant/70 uppercase font-bold">Team Leader</p>
                                </div>
                              </button>
                            );
                          })()
                        ) : currentUser.role === 'Team Leader' ? (
                          (() => {
                            const myInterns = users.filter(u => u.managerId === currentUser.id);
                            if (myInterns.length === 0) {
                              return (
                                <div className="text-center p-4 text-xs text-on-surface-variant/70 font-medium">
                                  No interns assigned to you yet.
                                </div>
                              );
                            }
                            return myInterns.map(intern => {
                              const isSelected = activeChatUserId === intern.id;
                              const avatar = employees.find(e => e.id === intern.employeeId)?.avatarUrl;
                              return (
                                <button
                                  key={intern.id}
                                  onClick={() => {
                                    setActiveChatUserId(intern.id);
                                    fetchChatMessages();
                                  }}
                                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                                    isSelected
                                      ? 'bg-primary/10 text-primary border border-primary/20 font-semibold'
                                      : 'hover:bg-surface-container-low text-on-surface-variant'
                                  }`}
                                >
                                  {avatar ? (
                                    <img src={avatar} alt={intern.fullName} className="w-9 h-9 rounded-full object-cover border border-outline-variant" />
                                  ) : (
                                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                                      {intern.fullName.charAt(0)}
                                    </div>
                                  )}
                                  <div className="truncate">
                                    <p className="text-xs font-bold">{intern.fullName}</p>
                                    <p className="text-[9px] text-on-surface-variant/70 font-semibold">@{intern.username}</p>
                                  </div>
                                </button>
                              );
                            });
                          })()
                        ) : (
                          <div className="text-center p-4 text-xs text-on-surface-variant/70 font-medium">
                            Admin check: Go to User Management to assign Team Leaders.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Chat Messages Container */}
                    <div className="flex-1 flex flex-col bg-surface-container-lowest">
                      {activeChatUserId ? (
                        (() => {
                          const activeChatUser = users.find(u => u.id === activeChatUserId);
                          const activeChatUserAvatar = activeChatUser
                            ? employees.find(e => e.id === activeChatUser.employeeId)?.avatarUrl
                            : undefined;

                          const filteredMsgs = chatMessages.filter(
                            m =>
                              (m.senderId === currentUser.id && m.receiverId === activeChatUserId) ||
                              (m.senderId === activeChatUserId && m.receiverId === currentUser.id)
                          );

                          const handleSendSubmit = (e: FormEvent) => {
                            e.preventDefault();
                            if (!chatInputMessage.trim()) return;
                            sendChatMessage(chatInputMessage.trim(), activeChatUserId);
                            setChatInputMessage('');
                          };

                          return (
                            <>
                              {/* Header */}
                              <div className="p-4 border-b border-outline-variant/40 flex items-center gap-3 bg-white">
                                {activeChatUserAvatar ? (
                                  <img src={activeChatUserAvatar} alt={activeChatUser?.fullName} className="w-8 h-8 rounded-full object-cover" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                                    {activeChatUser?.fullName.charAt(0)}
                                  </div>
                                )}
                                <div>
                                  <h4 className="font-bold text-xs text-primary">{activeChatUser?.fullName}</h4>
                                  <span className="inline-flex items-center gap-1 text-[9px] text-emerald-500 font-bold">
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                    Active Channel
                                  </span>
                                </div>
                              </div>

                              {/* Messages Feed */}
                              <div className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col">
                                {filteredMsgs.length === 0 ? (
                                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-2 opacity-70">
                                    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                                      <MessageSquare className="w-6 h-6" />
                                    </div>
                                    <h4 className="text-xs font-bold text-primary">No Messages Yet</h4>
                                    <p className="text-[10px] text-on-surface-variant max-w-[200px]">Send a greeting message to start the conversation.</p>
                                  </div>
                                ) : (
                                  filteredMsgs.map(msg => {
                                    const isMe = msg.senderId === currentUser.id;
                                    return (
                                      <div
                                        key={msg.id}
                                        className={`flex flex-col max-w-[75%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
                                      >
                                        <div
                                          className={`p-3 rounded-2xl text-xs font-semibold shadow-xs ${
                                            isMe
                                              ? 'bg-primary text-on-primary rounded-tr-none'
                                              : 'bg-white text-on-surface border border-outline-variant/40 rounded-tl-none'
                                          }`}
                                        >
                                          {msg.message}
                                        </div>
                                        <span className="text-[9px] text-on-surface-variant/60 font-semibold mt-1 px-1">
                                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                      </div>
                                    );
                                  })
                                )}
                              </div>

                              {/* Chat Input */}
                              <form onSubmit={handleSendSubmit} className="p-4 bg-white border-t border-outline-variant/40 flex gap-2">
                                <input
                                  type="text"
                                  value={chatInputMessage}
                                  onChange={(e) => setChatInputMessage(e.target.value)}
                                  placeholder="Type your message here..."
                                  className="flex-1 bg-surface-container-low border border-outline-variant/60 rounded-xl px-4 py-2.5 text-xs text-on-surface focus:outline-none focus:border-primary/60 font-medium"
                                />
                                <button
                                  type="submit"
                                  className="bg-primary hover:bg-primary/90 text-on-primary px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                                >
                                  Send
                                </button>
                              </form>
                            </>
                          );
                        })()
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3 opacity-85">
                          <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center animate-bounce">
                            <MessageSquare className="w-8 h-8" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-primary">Your Workspace Chat</h3>
                            <p className="text-[10px] text-on-surface-variant max-w-[280px] mt-1 font-medium">
                              Select a contact from the left list to begin messaging.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODALS RENDER SECTION */}
      {/* ============================================================== */}

      {/* 1. EXPORT OVERALL REPORTS DIALOG MODAL */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-[99] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 border border-outline-variant max-w-md w-full shadow-2xl space-y-4 animate-scale-up">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
              <h3 className="font-bold text-primary">Export Overall Attendance</h3>
              <button onClick={() => setIsExportModalOpen(false)} className="p-1 hover:bg-surface-container rounded-full cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-medium">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Start Date</label>
                  <input
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">End Date</label>
                  <input
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => handleExportCSV(exportStartDate, exportEndDate)}
                  className="w-full bg-primary hover:bg-primary/90 text-on-primary py-2.5 rounded-lg font-bold shadow-sm transition-all cursor-pointer"
                >
                  Download Daywise CSV Report
                </button>
                <button
                  onClick={() => handleExportOverallPDF(exportStartDate, exportEndDate)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg font-bold shadow-sm transition-all cursor-pointer"
                >
                  Export & Print PDF Document
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. EXPORT SELECTED PROFILE REPORT DIALOG MODAL */}
      {isProfileExportModalOpen && selectedEmployeeForProfile && (
        <div className="fixed inset-0 z-[99] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 border border-outline-variant max-w-md w-full shadow-2xl space-y-4 animate-scale-up">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
              <h3 className="font-bold text-primary">Export Profile: {selectedEmployeeForProfile.name}</h3>
              <button onClick={() => setIsProfileExportModalOpen(false)} className="p-1 hover:bg-surface-container rounded-full cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-medium">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Start Date</label>
                  <input
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">End Date</label>
                  <input
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => handleExportProfileCSV(selectedEmployeeForProfile, exportStartDate, exportEndDate)}
                  className="w-full bg-primary hover:bg-primary/90 text-on-primary py-2.5 rounded-lg font-bold shadow-sm transition-all cursor-pointer"
                >
                  Download Profile CSV Log
                </button>
                <button
                  onClick={() => handleExportProfilePDF(selectedEmployeeForProfile, exportStartDate, exportEndDate)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg font-bold shadow-sm transition-all cursor-pointer"
                >
                  Export & Print PDF Profile Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. ADD / EDIT USER DIALOG MODAL (Admin Action) */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-[99] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 border border-outline-variant max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4 animate-scale-up">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
              <h3 className="font-bold text-primary">{editingUser ? 'Modify User Profile' : 'Register New User & Employee'}</h3>
              <button onClick={() => setIsUserModalOpen(false)} className="p-1 hover:bg-surface-container rounded-full cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUserCRUDSubmit} className="space-y-4 text-xs font-medium">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="John Doe"
                    value={userFormFullName}
                    onChange={(e) => setUserFormFullName(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Username</label>
                  <input
                    type="text"
                    required
                    placeholder="john_doe"
                    value={userFormUsername}
                    onChange={(e) => setUserFormUsername(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="john@company.com"
                    value={userFormEmail}
                    onChange={(e) => setUserFormEmail(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Phone Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 555-0199"
                    value={userFormPhone}
                    onChange={(e) => setUserFormPhone(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Designation / Role</label>
                  <input
                    type="text"
                    required
                    placeholder="Software Engineer"
                    value={userFormDesignation}
                    onChange={(e) => setUserFormDesignation(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Department</label>
                  <input
                    type="text"
                    required
                    placeholder="Engineering"
                    value={userFormDepartment}
                    onChange={(e) => setUserFormDepartment(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Corporate ID (EMP Code)</label>
                  <input
                    type="text"
                    required
                    placeholder="EMP-101"
                    value={userFormEmployeeId}
                    onChange={(e) => setUserFormEmployeeId(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Joining Date</label>
                  <input
                    type="date"
                    value={userFormJoiningDate}
                    onChange={(e) => setUserFormJoiningDate(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">System Role (RBAC)</label>
                  <select
                    value={userFormRole}
                    onChange={(e) => setUserFormRole(e.target.value as any)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  >
                    <option value="Employee">Employee (Standard Access)</option>
                    <option value="Team Leader">Team Leader</option>
                    <option value="Admin">Admin (Full Access Control)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Account Status</label>
                  <select
                    value={userFormStatus}
                    onChange={(e) => setUserFormStatus(e.target.value as any)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  >
                    <option value="Active">Active / Enabled</option>
                    <option value="Disabled">Disabled / Inactive</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Intern Type</label>
                  <select
                    value={userFormInternType}
                    onChange={(e) => setUserFormInternType(e.target.value as any)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  >
                    <option value="Online Intern">Online Intern</option>
                    <option value="Offline Intern">Offline Intern</option>
                  </select>
                </div>

                {userFormRole === 'Employee' && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Assign Team Leader</label>
                    <select
                      value={userFormManagerId}
                      onChange={(e) => setUserFormManagerId(e.target.value)}
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                    >
                      <option value="">No Team Leader (Unassigned)</option>
                      {users
                        .filter(u => u.role === 'Team Leader' && u.status === 'Active' && u.id !== editingUser?.id)
                        .map(u => (
                          <option key={u.id} value={u.id}>{u.fullName} (@{u.username})</option>
                        ))
                      }
                    </select>
                  </div>
                )}

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">
                    {editingUser ? 'Password Overrides (Leave blank to keep existing)' : 'Account Password'}
                  </label>
                  <input
                    type="password"
                    placeholder={editingUser ? '••••••••' : 'Enter login password (min 6 chars)'}
                    value={userFormPassword}
                    onChange={(e) => setUserFormPassword(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 hover:bg-slate-100 rounded-lg text-on-surface-variant font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-primary hover:bg-primary/90 text-on-primary px-6 py-2 rounded-lg font-bold shadow-sm cursor-pointer"
                >
                  {editingUser ? 'Apply Changes' : 'Register User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. ADD TASK DIALOG MODAL (Employee / Manager assignment) */}
      {isAddTaskModalOpen && currentUser && (
        <div className="fixed inset-0 z-[99] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 border border-outline-variant max-w-md w-full shadow-2xl space-y-4 animate-scale-up">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
              <h3 className="font-bold text-primary">Assign New Task</h3>
              <button onClick={() => setIsAddTaskModalOpen(false)} className="p-1 hover:bg-surface-container rounded-full cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTaskSubmit} className="space-y-4 text-xs font-medium">
              <div className="space-y-1">
                <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Task Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Audit documentation review"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Detailed Description</label>
                <textarea
                  placeholder="Task details and instructions..."
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  rows={3}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as any)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Deadline</label>
                  <input
                    type="datetime-local"
                    value={newTaskDeadline}
                    onChange={(e) => setNewTaskDeadline(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  />
                </div>
              </div>

              {/* Assignee choice (Admins and Team Leaders can assign) */}
              <div className="space-y-1">
                <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Assignee</label>
                {currentUser.role === 'Admin' || currentUser.role === 'Team Leader' ? (
                  <select
                    value={newTaskAssigneeId}
                    onChange={(e) => setNewTaskAssigneeId(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                  >
                    <option value="">Select corporate assignee...</option>
                    {currentUser.role === 'Team Leader' ? (
                      <>
                        <option value={currentUser.id}>{currentUser.fullName} (Self Assignment)</option>
                        {users.filter(u => u.managerId === currentUser.id).map(u => (
                          <option key={u.id} value={u.id}>{u.fullName} (@{u.username})</option>
                        ))}
                      </>
                    ) : (
                      users.map(u => (
                        <option key={u.id} value={u.id}>{u.fullName} (@{u.username})</option>
                      ))
                    )}
                  </select>
                ) : (
                  <input
                    type="text"
                    disabled
                    value={`${currentUser.fullName} (Self Assignment)`}
                    className="w-full bg-slate-100 border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface-variant/80 focus:outline-none"
                  />
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Document Attachment URL (Optional)</label>
                <input
                  type="text"
                  placeholder="Link to file..."
                  value={newTaskAttachment}
                  onChange={(e) => setNewTaskAttachment(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setIsAddTaskModalOpen(false)}
                  className="px-4 py-2 hover:bg-slate-100 rounded-lg text-on-surface-variant font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-primary hover:bg-primary/90 text-on-primary px-6 py-2 rounded-lg font-bold shadow-sm cursor-pointer"
                >
                  Assign Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. ADMIN LEAVE COMMENT & DECISION MODAL */}
      {isAdminLeaveCommentModalOpen && selectedLeaveForAdminAction && (
        <div className="fixed inset-0 z-[99] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 border border-outline-variant max-w-md w-full shadow-2xl space-y-4 animate-scale-up">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
              <h3 className="font-bold text-primary">Process Leave Request</h3>
              <button onClick={() => setIsAdminLeaveCommentModalOpen(false)} className="p-1 hover:bg-surface-container rounded-full cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdminLeaveDecisionSubmit} className="space-y-4 text-xs font-medium">
              <p className="text-on-surface-variant text-[11px] font-semibold">
                Applying decision: <strong className={adminLeaveActionType === 'Approved' ? 'text-emerald-700' : 'text-error'}>{adminLeaveActionType}</strong> for applicant: {users.find(u => u.id === selectedLeaveForAdminAction.userId)?.fullName} ({selectedLeaveForAdminAction.totalDays} days).
              </p>

              <div className="space-y-1">
                <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">Admin Remarks / Comments</label>
                <textarea
                  placeholder="Provide approval / rejection comments here..."
                  value={adminLeaveComment}
                  onChange={(e) => setAdminLeaveComment(e.target.value)}
                  rows={3}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setIsAdminLeaveCommentModalOpen(false)}
                  className="px-4 py-2 hover:bg-slate-100 rounded-lg text-on-surface-variant font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-6 py-2 rounded-lg font-bold shadow-sm cursor-pointer ${
                    adminLeaveActionType === 'Approved'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-error hover:bg-error/90 text-on-primary'
                  }`}
                >
                  Apply Decision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clock Out Work Summary Modal */}
      {isClockOutModalOpen && (
        <div className="fixed inset-0 z-[99] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl p-6 border border-outline-variant max-w-md w-full shadow-2xl space-y-4 animate-scale-up">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
              <h3 className="font-bold text-primary flex items-center gap-2 text-base">
                <Clock className="w-5 h-5 text-amber-500" />
                Clock Out Work Summary
              </h3>
              <button onClick={() => setIsClockOutModalOpen(false)} className="p-1 hover:bg-surface-container rounded-full cursor-pointer transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleClockOutSubmit} className="space-y-4 text-xs font-medium">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-amber-800 text-[11px] leading-relaxed">
                <strong>Almost done!</strong> Before clocking out, please enter a summary of the tasks and work you completed today. This will be recorded as a completed task under your profile and will be reflected on the Team Leader and Admin dashboards.
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">What have you done today? *</label>
                <textarea
                  required
                  placeholder="Describe your achievements and tasks completed today in detail..."
                  value={clockOutWorkSummary}
                  onChange={(e) => setClockOutWorkSummary(e.target.value)}
                  rows={4}
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setIsClockOutModalOpen(false)}
                  className="px-4 py-2 hover:bg-slate-100 rounded-lg text-on-surface-variant font-bold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2 rounded-lg font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <CheckSquare className="w-4 h-4" />
                  Submit & Clock Out
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
