-- schema.sql
-- Create database tables for the Z-Hajirii Attendance Management System.
-- You can copy and paste this script directly into the Supabase SQL Editor.

-- 1. Create Employees table
CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT NOT NULL,
    avatar_url TEXT NOT NULL,
    emp_id TEXT NOT NULL UNIQUE,
    active_now BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Attendance Logs table
CREATE TABLE IF NOT EXISTS attendance_logs (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    clock_in TEXT NOT NULL,
    clock_out TEXT NOT NULL,
    total_hours TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Late')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Set up Row Level Security (RLS)
-- To keep things simple, you can disable RLS or create permissive policies.
-- Enable RLS for security:
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

-- Create public read/write policies (adjust according to your access needs):
CREATE POLICY "Allow public select on employees" ON employees FOR SELECT USING (true);
CREATE POLICY "Allow public insert on employees" ON employees FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on employees" ON employees FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on employees" ON employees FOR DELETE USING (true);

CREATE POLICY "Allow public select on attendance_logs" ON attendance_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on attendance_logs" ON attendance_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on attendance_logs" ON attendance_logs FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on attendance_logs" ON attendance_logs FOR DELETE USING (true);
