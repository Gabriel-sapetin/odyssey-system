const SUPABASE_URL = 'https://wbdecpzzffnuhbecfmmn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZGVjcHp6ZmZudWhiZWNmbW1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NDE0NTcsImV4cCI6MjA5NDUxNzQ1N30.civTf53PMxmYFXx8Ao-eqzNWNtltoKqI93Mjqjq2We4';

// The CDN creates a global `var supabase` (the library module).
// We CANNOT redeclare it with const/let — so we store the client on window.
window.supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
