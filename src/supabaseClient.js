import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const scoresTable = import.meta.env.VITE_SCORES_TABLE_NAME || 'scores';

if (!supabaseUrl) throw new Error('supabaseUrl is required');
if (!supabaseAnonKey) throw new Error('supabaseAnonKey is required');

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function submitHighScore(name, score) {
  const { data, error } = await supabase
    .from(scoresTable)
    .insert([{ name, score }]);

  if (error) throw error;
  return data;
}

export async function fetchHighScores(limit = 10) {
  const { data, error } = await supabase
    .from(scoresTable)
    .select('*')
    .order('score', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
