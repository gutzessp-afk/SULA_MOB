// Cliente de Supabase. Se inicializa con las variables de entorno.
// Lo usan todos los módulos para hablar con la base de datos.
// Responsable: Dev 1 (base).

// import { createClient } from "@supabase/supabase-js";
// export const supabase = createClient(URL, ANON_KEY);
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);