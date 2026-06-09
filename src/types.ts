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

export type ViewTab = 'Dashboard' | 'Attendance' | 'Users' | 'Reports';

export interface AttendanceStats {
  totalEmployees: number;
  present: number;
  absent: number;
  late: number;
}
