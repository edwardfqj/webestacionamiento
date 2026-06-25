import { getSQL } from './src/lib/db';

async function migrate() {
  const sql = getSQL();
  console.log('Migrating database...');
  try {
    await sql`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS hora_entrada TIMESTAMP;`;
    console.log('Column hora_entrada added successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrate();
