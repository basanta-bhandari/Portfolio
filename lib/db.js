// Uses the DATABASE_URL env var that the Neon integration adds to this
// project automatically (Storage tab -> your database -> Connect to Project).
import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL);
