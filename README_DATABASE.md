# Database Setup Instructions

## Prerequisites
- PostgreSQL installed and running
- Database created (or use an existing one)

## Method 1: Using psql Command Line

1. **Connect to your PostgreSQL database:**
   ```bash
   psql -U your_username -d your_database_name
   ```

2. **Run the schema file:**
   ```bash
   psql -U your_username -d your_database_name -f supabase/schema.sql
   ```

   Or from within psql:
   ```sql
   \i supabase/schema.sql
   ```

## Method 2: Using pgAdmin

1. Open pgAdmin
2. Connect to your PostgreSQL server
3. Right-click on your database → Query Tool
4. Open the `supabase/schema.sql` file
5. Execute the query (F5 or click Run)

## Method 3: Using a Database Client (DBeaver, TablePlus, etc.)

1. Connect to your PostgreSQL database
2. Open the SQL editor
3. Copy and paste the contents of `supabase/schema.sql`
4. Execute the script

## Method 4: Using Node.js Script

You can also create a setup script to run the schema automatically.

## Verify Tables Created

After running the schema, verify the tables exist:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('lobbies', 'game_plays');

-- Check table structure
\d lobbies
\d game_plays
```

## Environment Variable

Make sure your `.env.local` file has:

```
DATABASE_URL=postgresql://username:password@localhost:5432/database_name
```

Replace:
- `username` - your PostgreSQL username
- `password` - your PostgreSQL password
- `localhost:5432` - your PostgreSQL host and port
- `database_name` - your database name

