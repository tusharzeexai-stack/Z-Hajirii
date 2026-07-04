export interface Employee {
  id: string;
  name: string;
  role: string;
  email: string;
  avatarUrl: string;
  empId: string;
  activeNow: boolean;
  createdAt?: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  clockIn: string;
  clockOut: string;
  totalHours: string;
  status: 'Present' | 'Absent' | 'Late';
}

export type ViewTab =
  | 'Dashboard'
  | 'Attendance'
  | 'Users'
  | 'Reports'
  | 'LeaveManagement'
  | 'UserManagement'
  | 'EmpDashboard'
  | 'MyTasks'
  | 'PendingTasks'
  | 'CompletedTasks'
  | 'LeaveRequests'
  | 'ApprovedLeaves'
  | 'EmpProfile'
  | 'EmpSettings'
  | 'TeamLeaderDashboard'
  | 'AdminTeamLeaders'
  | 'AdminTLTasks';

export interface AttendanceStats {
  totalEmployees: number;
  present: number;
  absent: number;
  late: number;
}

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  fullName: string;
  email: string;
  employeeId: string | null;
  department: string;
  designation: string;
  phoneNumber?: string;
  joiningDate?: string;
  role: 'Employee' | 'Admin' | 'Team Leader';
  status: 'Active' | 'Disabled';
  internType?: 'Online Intern' | 'Offline Intern';
  managerId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskRecord {
  id: string;
  userId: string;
  title: string;
  description: string;
  priority: 'Low' | 'Medium' | 'High';
  deadline: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  attachment?: string;
  completedAt?: string;
  createdAt?: string;
}

export interface LeaveRequestRecord {
  id: string;
  userId: string;
  leaveType: 'Casual' | 'Sick' | 'Emergency' | 'Work From Home';
  fromDate: string;
  toDate: string;
  totalDays: number;
  reason: string;
  description?: string;
  attachment?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  adminComment?: string;
  approvedBy?: string | null;
  approvedAt?: string;
  createdAt?: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'Task' | 'Leave' | 'System';
  isRead: boolean;
  createdAt?: string;
}

export interface AuditLogRecord {
  id: string;
  userId?: string | null;
  username?: string;
  action: string;
  details: string;
  ipAddress?: string;
  createdAt?: string;
}
