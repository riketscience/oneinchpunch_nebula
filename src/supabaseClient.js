import { createClient } from '@supabase/supabase-js';

// These are read from your environment, both locally and on Vercel
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Fetch top 10 high scores
export async function fetchHighScores() {
  const { data, error } = await supabase
    .from('scores')
    .select('*')
    .order('score', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching high scores:', error);
    return [];
  }

  return data;
}

// Insert new score
export async function submitHighScore(name, score) {
  const { data, error } = await supabase
    .from('scores')
    .insert([{ name, score }]);

  if (error) {
    console.error('Error submitting high score:', error);
    return null;
  }

  return data;
}
