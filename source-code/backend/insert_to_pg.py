import psycopg2
import json
import os
import sys

# --- Fill in your PostgreSQL connection details here ---
conn = psycopg2.connect(
    host="localhost",  # change as needed
    port=5432,          # change as needed
    dbname="before_verify_db",  # change as needed
    user="postgres",   # change as needed
    password="your_password" # change as needed
)

def ensure_columns(cur, table, required_columns):
    # Get existing columns
    cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name='{table}';")
    existing = set(row[0] for row in cur.fetchall())
    for col in required_columns:
        if col not in existing:
            cur.execute(f'ALTER TABLE {table} ADD COLUMN "{col}" TEXT;')

# Track if the table has been dropped in this process
_table_dropped = False

def insert_dynamic(json_data_list, table='documents'):
    global _table_dropped
    cur = conn.cursor()
    # Drop the table only once per program execution
    if not _table_dropped:
        try:
            print("Dropping table if exists...")
            cur.execute(f"DROP TABLE IF EXISTS {table};")
            print("Table dropped (or did not exist).")
        except Exception as e:
            print(f"Error dropping table: {e}", file=sys.stderr)
            raise
        _table_dropped = True
    # Create table with all columns from all dicts
    all_keys = set()
    for d in json_data_list:
        all_keys.update(d.keys())
    columns = ', '.join([f'"{k}" TEXT' for k in all_keys])
    try:
        print("Creating table if not exists...")
        cur.execute(f'CREATE TABLE IF NOT EXISTS {table} ({columns});')
        print("Table created or already exists.")
    except Exception as e:
        print(f"Error creating table: {e}", file=sys.stderr)
        raise
    ensure_columns(cur, table, all_keys)
    # Insert each row
    for json_data in json_data_list:
        ensure_columns(cur, table, json_data.keys())
        keys = ', '.join([f'"{k}"' for k in json_data.keys()])
        values = ', '.join(['%s'] * len(json_data))
        try:
            print(f'Inserting row: {json_data}')
            cur.execute(f'INSERT INTO {table} ({keys}) VALUES ({values});', list(json_data.values()))
        except Exception as e:
            print(f"Error inserting row: {e}", file=sys.stderr)
            raise
    conn.commit()
    cur.close()

def insert_from_api_response(json_data_list):
    """
    Call this function with a list of classified JSON objects (from your API response)
    to insert them into the database.
    """
    insert_dynamic(json_data_list)

if __name__ == "__main__":
    # Read JSON data from stdin (for integration with Node.js or other scripts)
    try:
        input_data = sys.stdin.read()
        if input_data.strip():
            json_data_list = json.loads(input_data)
            insert_from_api_response(json_data_list)
    except Exception as e:
        print(f"Error reading or inserting data: {e}", file=sys.stderr)
    finally:
        conn.close()
else:
    conn.close()
