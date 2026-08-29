-- ============================================================================
-- Z-Hajirii PostgreSQL Row-Level Security (RLS) Policy Migration Script
-- ============================================================================
-- Enables engine-enforced data isolation on all sensitive tables.

-- 1. Enable RLS on core domain tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- 2. Create tasks RLS policy: users can only see self tasks or managed subordinate tasks
DROP POLICY IF EXISTS tasks_isolation_policy ON tasks;
CREATE POLICY tasks_isolation_policy ON tasks
    FOR ALL
    USING (
        user_id = current_setting('app.current_user_id', true)::uuid
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = tasks.user_id
              AND u.manager_id = current_setting('app.current_user_id', true)::uuid
        )
        OR current_setting('app.current_user_role', true) = 'Admin'
    );

-- 3. Create leave requests RLS policy: users can only see self leaves or managed leaves
DROP POLICY IF EXISTS leave_isolation_policy ON leave_requests;
CREATE POLICY leave_isolation_policy ON leave_requests
    FOR ALL
    USING (
        user_id = current_setting('app.current_user_id', true)::uuid
        OR EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = leave_requests.user_id
              AND u.manager_id = current_setting('app.current_user_id', true)::uuid
        )
        OR current_setting('app.current_user_role', true) = 'Admin'
    );

-- 4. Create chat messages RLS policy: users can only read messages where sender or receiver
DROP POLICY IF EXISTS chat_isolation_policy ON chat_messages;
CREATE POLICY chat_isolation_policy ON chat_messages
    FOR ALL
    USING (
        sender_id = current_setting('app.current_user_id', true)::uuid
        OR receiver_id = current_setting('app.current_user_id', true)::uuid
        OR current_setting('app.current_user_role', true) = 'Admin'
    );

COMMIT;
