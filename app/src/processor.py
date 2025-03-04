import os
import boto3
import pandas as pd
import psycopg2
import logging
from io import StringIO

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Get environment variables
S3_BUCKET = os.environ.get('S3_BUCKET')
S3_PREFIX = os.environ.get('S3_PREFIX', '')
DB_HOST = os.environ.get('DB_HOST')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME')
DB_USER = os.environ.get('DB_USER')
DB_PASSWORD = os.environ.get('DB_PASSWORD')

def get_s3_client():
    """Create a boto3 S3 client with appropriate credentials."""
    # AWS credentials are handled by the ECS task role
    return boto3.client('s3')

def get_db_connection():
    """Create a connection to the PostgreSQL database."""
    try:
        # Get the database password from AWS Secrets Manager if not provided as environment variable
        password = DB_PASSWORD
        if not password:
            logger.info("No password provided in environment variables, retrieving from Secrets Manager")
            secret_name = os.environ.get('DB_SECRET_NAME')
            if not secret_name:
                raise ValueError("Neither DB_PASSWORD nor DB_SECRET_NAME environment variable is set")
            
            # Get the secret
            secretsmanager = boto3.client('secretsmanager')
            secret_response = secretsmanager.get_secret_value(SecretId=secret_name)
            secret = secret_response.get('SecretString')
            
            # Parse the secret JSON
            import json
            secret_dict = json.loads(secret)
            password = secret_dict.get('password')
            
            if not password:
                raise ValueError("Could not retrieve password from secret")
            
            logger.info("Successfully retrieved database password from Secrets Manager")
        
        # Connect to the database
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=password
        )
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        raise

def process_csv_file(s3_client, bucket, key):
    """Process a CSV file from S3 and return a pandas DataFrame."""
    try:
        # Download the file from S3
        response = s3_client.get_object(Bucket=bucket, Key=key)
        content = response['Body'].read().decode('utf-8')
        
        # Parse CSV to DataFrame
        df = pd.read_csv(StringIO(content))
        logger.info(f"Successfully processed file {key} with {len(df)} rows")
        return df
    except Exception as e:
        logger.error(f"Error processing file {key}: {e}")
        raise

def save_to_postgres(df, table_name, conn):
    """
    Save DataFrame data to PostgreSQL table using UPSERT pattern.
    Will update existing records if they have the same natural key.
    """
    try:
        # Add a processing timestamp
        df['processed_at'] = pd.Timestamp.now().isoformat()
        
        # Create a cursor
        cur = conn.cursor()
        
        # Identify natural key columns (assuming 'id' as primary if present)
        natural_key_cols = ['id'] if 'id' in df.columns else []
        
        # If no natural ID found and email exists, use that as a natural key
        if not natural_key_cols and 'email' in df.columns:
            natural_key_cols = ['email']
        
        # Create table if it doesn't exist with appropriate column types
        column_definitions = []
        for col in df.columns:
            if pd.api.types.is_numeric_dtype(df[col]):
                col_type = "NUMERIC"
            elif pd.api.types.is_datetime64_dtype(df[col]):
                col_type = "TIMESTAMP"
            else:
                col_type = "TEXT"
            column_definitions.append(f'"{col}" {col_type}')
        
        # Add serial primary key if no natural key is found
        table_columns = ', '.join(column_definitions)
        if not natural_key_cols:
            create_table_query = f'CREATE TABLE IF NOT EXISTS {table_name} (record_id SERIAL PRIMARY KEY, {table_columns})'
        else:
            create_table_query = f'CREATE TABLE IF NOT EXISTS {table_name} ({table_columns})'
            
            # Add unique constraint for natural keys if they don't exist
            for col in natural_key_cols:
                # Check if constraint exists
                check_constraint_query = f"""
                SELECT constraint_name 
                FROM information_schema.table_constraints 
                WHERE table_name = '{table_name}' 
                AND constraint_type = 'UNIQUE' 
                AND constraint_name = '{table_name}_{col}_key'
                """
                cur.execute(check_constraint_query)
                if not cur.fetchone():
                    # Add unique constraint if it doesn't exist
                    add_constraint_query = f'ALTER TABLE {table_name} ADD CONSTRAINT {table_name}_{col}_key UNIQUE ("{col}")'
                    try:
                        cur.execute(add_constraint_query)
                    except Exception as e:
                        logger.warning(f"Could not add unique constraint: {e}")
                        # Continue anyway
        
        cur.execute(create_table_query)
        
        # Insert data with ON CONFLICT handling
        for _, row in df.iterrows():
            placeholders = ', '.join(['%s'] * len(row))
            columns = ', '.join([f'"{col}"' for col in df.columns])
            
            if natural_key_cols:
                # Create the update part
                update_set = ', '.join([f'"{col}" = EXCLUDED."{col}"' for col in df.columns 
                                      if col not in natural_key_cols])
                
                # Create the conflict target
                conflict_cols = ', '.join([f'"{col}"' for col in natural_key_cols])
                
                # UPSERT query
                insert_query = f'''
                    INSERT INTO {table_name} ({columns})
                    VALUES ({placeholders})
                    ON CONFLICT ({conflict_cols}) DO UPDATE 
                    SET {update_set}
                '''
            else:
                # Simple insert if no natural key
                insert_query = f'INSERT INTO {table_name} ({columns}) VALUES ({placeholders})'
            
            cur.execute(insert_query, tuple(row))
        
        # Commit the transaction
        conn.commit()
        logger.info(f"Successfully saved {len(df)} rows to table {table_name} using upsert pattern")
    except Exception as e:
        conn.rollback()
        logger.error(f"Error saving data to PostgreSQL: {e}")
        raise
    finally:
        cur.close()

def main():
    """Main function to orchestrate the data processing pipeline."""
    try:
        logger.info("Starting data processing pipeline")
        
        # Initialize S3 client
        s3_client = get_s3_client()
        
        # List files in the S3 bucket
        paginator = s3_client.get_paginator('list_objects_v2')
        page_iterator = paginator.paginate(Bucket=S3_BUCKET, Prefix=S3_PREFIX)
        
        # Connect to database
        conn = get_db_connection()
        
        # Process each file
        for page in page_iterator:
            if 'Contents' in page:
                for obj in page['Contents']:
                    key = obj['Key']
                    if key.endswith('.csv'):
                        logger.info(f"Processing file: {key}")
                        df = process_csv_file(s3_client, S3_BUCKET, key)
                        
                        # Use the filename (without extension) as the table name
                        table_name = os.path.basename(key).split('.')[0]
                        save_to_postgres(df, table_name, conn)
        
        # Close the database connection
        conn.close()
        logger.info("Data processing pipeline completed successfully")
    except Exception as e:
        logger.error(f"Pipeline error: {e}")
        raise

if __name__ == "__main__":
    main()