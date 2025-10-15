import { supabase } from '../lib/supabaseClient'

const SETUP_SQL = `
-- Create missing tables for user profiles and settings
-- 1. Create profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  currency text default 'USD',
  timezone text default 'UTC',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- Create policies for profiles
create policy "Users can view own profile" on public.profiles
  for select using ( auth.uid() = id );
create policy "Users can insert own profile" on public.profiles
  for insert with check ( auth.uid() = id );
create policy "Users can update own profile" on public.profiles
  for update using ( auth.uid() = id );
create policy "Users can delete own profile" on public.profiles
  for delete using ( auth.uid() = id );

-- 2. Create user_settings table
create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email_notifications boolean default true,
  push_notifications boolean default false,
  weekly_reports boolean default true,
  monthly_reports boolean default true,
  analytics boolean default true,
  marketing boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

-- Enable RLS on user_settings
alter table public.user_settings enable row level security;

-- Create policies for user_settings
create policy "Users can view own settings" on public.user_settings
  for select using ( auth.uid() = user_id );
create policy "Users can insert own settings" on public.user_settings
  for insert with check ( auth.uid() = user_id );
create policy "Users can update own settings" on public.user_settings
  for update using ( auth.uid() = user_id );
create policy "Users can delete own settings" on public.user_settings
  for delete using ( auth.uid() = user_id );

-- 3. Create function to automatically create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  
  insert into public.user_settings (user_id)
  values (new.id);
  
  return new;
end;
$$ language plpgsql security definer;

-- Create trigger to run the function on user signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
`;

export default async function setupDatabase() {
  try {
    console.log('Setting up database tables...')
    
    // Note: This requires the service role key, not the anon key
    // You'll need to use the Supabase dashboard SQL editor instead
    
    const { data, error } = await supabase.rpc('exec', { sql: SETUP_SQL })
    
    if (error) {
      console.error('Database setup error:', error)
      return { success: false, error: error.message }
    }
    
    console.log('Database setup completed successfully!')
    return { success: true, data }
    
  } catch (error) {
    console.error('Setup failed:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
