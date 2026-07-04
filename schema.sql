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

-- 3. Create Users table (with RBAC roles and active status)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
    department TEXT NOT NULL,
    designation TEXT NOT NULL,
    phone_number TEXT,
    joining_date TEXT,
    role TEXT NOT NULL CHECK (role IN ('Employee', 'Manager', 'Admin', 'Team Leader')),
    status TEXT NOT NULL CHECK (status IN ('Active', 'Disabled')),
    intern_type TEXT CHECK (intern_type IN ('Online Intern', 'Offline Intern')),
    manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Migration script (run on existing database)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('Employee', 'Manager', 'Admin', 'Team Leader'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id TEXT REFERENCES users(id) ON DELETE SET NULL;


-- 4. Create Tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
    deadline TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Pending', 'In Progress', 'Completed')),
    attachment TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create Leave Requests table
CREATE TABLE IF NOT EXISTS leave_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    leave_type TEXT NOT NULL CHECK (leave_type IN ('Casual', 'Sick', 'Emergency', 'Work From Home')),
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    total_days INTEGER NOT NULL,
    reason TEXT NOT NULL,
    description TEXT,
    attachment TEXT,
    status TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    admin_comment TEXT,
    approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Create Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Task', 'Leave', 'System')),
    is_read BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Create Audit Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    username TEXT,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Set up Row Level Security (RLS)
-- To keep things simple, you can disable RLS or create permissive policies.
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to allow re-running this script
DROP POLICY IF EXISTS "Allow public select on employees" ON employees;
DROP POLICY IF EXISTS "Allow public insert on employees" ON employees;
DROP POLICY IF EXISTS "Allow public update on employees" ON employees;
DROP POLICY IF EXISTS "Allow public delete on employees" ON employees;

DROP POLICY IF EXISTS "Allow public select on attendance_logs" ON attendance_logs;
DROP POLICY IF EXISTS "Allow public insert on attendance_logs" ON attendance_logs;
DROP POLICY IF EXISTS "Allow public update on attendance_logs" ON attendance_logs;
DROP POLICY IF EXISTS "Allow public delete on attendance_logs" ON attendance_logs;

DROP POLICY IF EXISTS "Allow public select on users" ON users;
DROP POLICY IF EXISTS "Allow public insert on users" ON users;
DROP POLICY IF EXISTS "Allow public update on users" ON users;
DROP POLICY IF EXISTS "Allow public delete on users" ON users;

DROP POLICY IF EXISTS "Allow public select on tasks" ON tasks;
DROP POLICY IF EXISTS "Allow public insert on tasks" ON tasks;
DROP POLICY IF EXISTS "Allow public update on tasks" ON tasks;
DROP POLICY IF EXISTS "Allow public delete on tasks" ON tasks;

DROP POLICY IF EXISTS "Allow public select on leave_requests" ON leave_requests;
DROP POLICY IF EXISTS "Allow public insert on leave_requests" ON leave_requests;
DROP POLICY IF EXISTS "Allow public update on leave_requests" ON leave_requests;
DROP POLICY IF EXISTS "Allow public delete on leave_requests" ON leave_requests;

DROP POLICY IF EXISTS "Allow public select on notifications" ON notifications;
DROP POLICY IF EXISTS "Allow public insert on notifications" ON notifications;
DROP POLICY IF EXISTS "Allow public update on notifications" ON notifications;
DROP POLICY IF EXISTS "Allow public delete on notifications" ON notifications;

DROP POLICY IF EXISTS "Allow public select on audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Allow public insert on audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Allow public update on audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Allow public delete on audit_logs" ON audit_logs;

-- Create public read/write policies (adjust according to your access needs):
CREATE POLICY "Allow public select on employees" ON employees FOR SELECT USING (true);
CREATE POLICY "Allow public insert on employees" ON employees FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on employees" ON employees FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on employees" ON employees FOR DELETE USING (true);

CREATE POLICY "Allow public select on attendance_logs" ON attendance_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on attendance_logs" ON attendance_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on attendance_logs" ON attendance_logs FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on attendance_logs" ON attendance_logs FOR DELETE USING (true);

CREATE POLICY "Allow public select on users" ON users FOR SELECT USING (true);
CREATE POLICY "Allow public insert on users" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on users" ON users FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on users" ON users FOR DELETE USING (true);

CREATE POLICY "Allow public select on tasks" ON tasks FOR SELECT USING (true);
CREATE POLICY "Allow public insert on tasks" ON tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on tasks" ON tasks FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on tasks" ON tasks FOR DELETE USING (true);

CREATE POLICY "Allow public select on leave_requests" ON leave_requests FOR SELECT USING (true);
CREATE POLICY "Allow public insert on leave_requests" ON leave_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on leave_requests" ON leave_requests FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on leave_requests" ON leave_requests FOR DELETE USING (true);

CREATE POLICY "Allow public select on notifications" ON notifications FOR SELECT USING (true);
CREATE POLICY "Allow public insert on notifications" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on notifications" ON notifications FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on notifications" ON notifications FOR DELETE USING (true);

CREATE POLICY "Allow public select on audit_logs" ON audit_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on audit_logs" ON audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on audit_logs" ON audit_logs FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on audit_logs" ON audit_logs FOR DELETE USING (true);

-- 9. Create Chat Messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select on chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Allow public insert on chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Allow public update on chat_messages" ON chat_messages;
DROP POLICY IF EXISTS "Allow public delete on chat_messages" ON chat_messages;

CREATE POLICY "Allow public select on chat_messages" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "Allow public insert on chat_messages" ON chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on chat_messages" ON chat_messages FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on chat_messages" ON chat_messages FOR DELETE USING (true);
