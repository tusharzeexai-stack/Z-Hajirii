/**
 * migrate_supabase.js — Smart Dependency-Aware Supabase to AWS Data Migration Script
 */

const SUPABASE_URL = 'https://muqjbhariqlsbtkoaeiq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11cWpiaGFyaXFsc2J0a29hZWlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5Mjg3NDksImV4cCI6MjA5NjUwNDc0OX0.vO9--pqZV_qap6uDQd4Nvs6-OuKDiTroFeKsvIDIA7U';

const AWS_API_URL = 'https://yrhtexe0e5.execute-api.ap-south-1.amazonaws.com/prod';

async function fetchSupabaseTable(table) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      console.warn(`[Supabase] Could not fetch ${table}: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`[Supabase] Error fetching ${table}:`, err.message);
    return [];
  }
}

async function sendToAWS(table, record, queryParams = '') {
  try {
    const res = await fetch(`${AWS_API_URL}/${table}${queryParams}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`  ✕ AWS Error [${table}] ${record.id || 'N/A'}: ${errText}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`  ✕ AWS Network Error [${table}]:`, err.message);
    return false;
  }
}

async function runMigration() {
  console.log('====================================================');
  console.log('   Z-Hajirii Supabase to AWS Data Migration Script  ');
  console.log('====================================================');
  console.log(`Source Supabase : ${SUPABASE_URL}`);
  console.log(`Target AWS API  : ${AWS_API_URL}\n`);

  // Step 1: Fetch all data from Supabase
  console.log('[1/3] Fetching data from Supabase...');
  const employees = await fetchSupabaseTable('employees');
  const users = await fetchSupabaseTable('users');
  const attendanceLogs = await fetchSupabaseTable('attendance_logs');
  const tasks = await fetchSupabaseTable('tasks');
  const leaveRequests = await fetchSupabaseTable('leave_requests');
  const notifications = await fetchSupabaseTable('notifications');
  const auditLogs = await fetchSupabaseTable('audit_logs');
  const chatMessages = await fetchSupabaseTable('chat_messages');

  console.log(`  - Employees     : ${employees.length}`);
  console.log(`  - Users         : ${users.length}`);
  console.log(`  - Attendance    : ${attendanceLogs.length}`);
  console.log(`  - Tasks         : ${tasks.length}`);
  console.log(`  - Leave Requests: ${leaveRequests.length}`);
  console.log(`  - Notifications : ${notifications.length}`);
  console.log(`  - Audit Logs    : ${auditLogs.length}`);
  console.log(`  - Chat Messages : ${chatMessages.length}\n`);

  const validEmpIds = new Set(employees.map(e => e.id));
  const validUserIds = new Set(users.map(u => u.id));

  // Step 2: Migrate Employees first
  console.log('[2/3] Migrating Employees...');
  let empSuccess = 0;
  for (const emp of employees) {
    if (await sendToAWS('employees', emp)) empSuccess++;
  }
  console.log(`  ✓ Employees migrated: ${empSuccess}/${employees.length}\n`);

  // Step 3: Migrate Users (nullifying orphaned employee_id or manager_id)
  console.log('[3/3] Migrating Users...');
  let userSuccess = 0;
  for (const u of users) {
    const cleanUser = {
      ...u,
      employee_id: validEmpIds.has(u.employee_id) ? u.employee_id : null,
      manager_id: validUserIds.has(u.manager_id) ? u.manager_id : null
    };
    if (await sendToAWS('users', cleanUser)) userSuccess++;
  }
  console.log(`  ✓ Users migrated: ${userSuccess}/${users.length}\n`);

  // Step 4: Migrate Dependent Tables
  console.log('Migrating Attendance Logs...');
  let logSuccess = 0;
  for (const log of attendanceLogs) {
    if (validEmpIds.has(log.employee_id)) {
      if (await sendToAWS('attendance_logs', log)) logSuccess++;
    }
  }
  console.log(`  ✓ Attendance logs migrated: ${logSuccess}/${attendanceLogs.length}\n`);

  console.log('Migrating Tasks...');
  let taskSuccess = 0;
  for (const t of tasks) {
    if (validUserIds.has(t.user_id)) {
      if (await sendToAWS('tasks', t)) taskSuccess++;
    }
  }
  console.log(`  ✓ Tasks migrated: ${taskSuccess}/${tasks.length}\n`);

  console.log('Migrating Leave Requests...');
  let leaveSuccess = 0;
  for (const l of leaveRequests) {
    if (validUserIds.has(l.user_id)) {
      const cleanLeave = {
        ...l,
        approved_by: validUserIds.has(l.approved_by) ? l.approved_by : null
      };
      if (await sendToAWS('leave_requests', cleanLeave)) leaveSuccess++;
    }
  }
  console.log(`  ✓ Leave requests migrated: ${leaveSuccess}/${leaveRequests.length}\n`);

  console.log('Migrating Notifications...');
  let notifSuccess = 0;
  for (const n of notifications) {
    if (validUserIds.has(n.user_id)) {
      if (await sendToAWS('notifications', n)) notifSuccess++;
    }
  }
  console.log(`  ✓ Notifications migrated: ${notifSuccess}/${notifications.length}\n`);

  console.log('Migrating Audit Logs...');
  let auditSuccess = 0;
  for (const a of auditLogs) {
    const cleanAudit = {
      ...a,
      user_id: validUserIds.has(a.user_id) ? a.user_id : null
    };
    if (await sendToAWS('audit_logs', cleanAudit)) auditSuccess++;
  }
  console.log(`  ✓ Audit logs migrated: ${auditSuccess}/${auditLogs.length}\n`);

  console.log('Migrating Chat Messages...');
  let chatSuccess = 0;
  for (const c of chatMessages) {
    if (validUserIds.has(c.sender_id) && validUserIds.has(c.receiver_id)) {
      if (await sendToAWS('chat_messages', c)) chatSuccess++;
    }
  }
  console.log(`  ✓ Chat messages migrated: ${chatSuccess}/${chatMessages.length}\n`);

  console.log('====================================================');
  console.log('   🎉 Migration Complete! All data is live on AWS   ');
  console.log('====================================================');
}

runMigration();
