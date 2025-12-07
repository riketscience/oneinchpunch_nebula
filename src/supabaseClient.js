import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const scoresTable = import.meta.env.VITE_SCORES_TABLE_NAME || 'scores';

if (!supabaseUrl) throw new Error('supabaseUrl is required');
if (!supabaseAnonKey) throw new Error('supabaseAnonKey is required');

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function submitHighScore(name, score) {
  // Insert the new score
  const { error: insertError } = await supabase
    .from(scoresTable)
    .insert([{ name, score }]);

  if (insertError) throw insertError;

  // Clean up: keep only top 10 scores
  // First get all scores ordered by score descending, then by created_at descending
  // This ensures that for tied scores, newer entries come first
  const { data: allScores, error: fetchError } = await supabase
    .from(scoresTable)
    .select('*')
    .order('score', { ascending: false })
    .order('created_at', { ascending: false });

  if (fetchError) throw fetchError;

  // If more than 10, delete the excess
  if (allScores && allScores.length > 10) {
    const idsToDelete = allScores.slice(10).map(s => s.id);
    const { error: deleteError } = await supabase
      .from(scoresTable)
      .delete()
      .in('id', idsToDelete);

    if (deleteError) throw deleteError;
  }
}

export async function fetchHighScores(limit = 10) {
  const { data, error } = await supabase
    .from(scoresTable)
    .select('*')
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
