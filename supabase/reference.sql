-- reference.sql
-- The starting lists for a REAL project: languages, regions, genres, occasions and moods. Run it once after the migrations
-- (SQL editor, or `psql -f`). It is safe to run again: it only adds what is missing and never changes anything an admin has edited.
-- Afterwards the admin site's Lists page is where these are added to, renamed and removed.
-- This is not seed.sql: it holds no artists, songs, agreements or posters, only the choices the site offers.

insert into public.languages (code, name, native_name) values
  ('ta', 'Tamil', 'தமிழ்'), ('en', 'English', 'English'), ('hi', 'Hindi', 'हिन्दी'),
  ('te', 'Telugu', 'తెలుగు'), ('ml', 'Malayalam', 'മലയാളം'), ('kn', 'Kannada', 'ಕನ್ನಡ'),
  ('mr', 'Marathi', 'मराठी'), ('bn', 'Bengali', 'বাংলা'), ('ne', 'Nepali', 'नेपाली')
on conflict (code) do nothing;

insert into public.regions (code, name, country_code) values
  ('IN', 'India', 'IN'), ('IN-TN', 'Tamil Nadu', 'IN'), ('IN-KL', 'Kerala', 'IN'),
  ('IN-AP', 'Andhra Pradesh', 'IN'), ('IN-KA', 'Karnataka', 'IN'), ('IN-MH', 'Maharashtra', 'IN'),
  ('LK', 'Sri Lanka', 'LK'), ('SG', 'Singapore', 'SG'), ('MY', 'Malaysia', 'MY'),
  ('AE', 'United Arab Emirates', 'AE'), ('GB', 'United Kingdom', 'GB'), ('US', 'United States', 'US'),
  ('CA', 'Canada', 'CA'), ('AU', 'Australia', 'AU')
on conflict (code) do nothing;

insert into public.tags (kind, code, label) values
  ('genre', 'worship', 'Worship'), ('genre', 'praise', 'Praise'), ('genre', 'hymns', 'Hymns'),
  ('genre', 'gospel', 'Gospel'), ('genre', 'choir', 'Choir'), ('genre', 'kids', 'Kids'),
  ('occasion', 'sunday-service', 'Sunday service'), ('occasion', 'christmas', 'Christmas'),
  ('occasion', 'easter', 'Easter'), ('occasion', 'wedding', 'Wedding'), ('occasion', 'funeral', 'Funeral'),
  ('occasion', 'youth-camp', 'Youth camp'), ('occasion', 'new-year', 'New Year'),
  ('mood', 'joyful', 'Joyful'), ('mood', 'reflective', 'Reflective'),
  ('mood', 'peaceful', 'Peaceful'), ('mood', 'triumphant', 'Triumphant')
on conflict (kind, code) do nothing;
