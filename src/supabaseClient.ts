import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || 'https://muqjbhariqlsbtkoaeiq.supabase.co';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11cWpiaGFyaXFsc2J0a29hZWlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5Mjg3NDksImV4cCI6MjA5NjUwNDc0OX0.vO9--pqZV_qap6uDQd4Nvs6-OuKDiTroFeKsvIDIA7U';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);


