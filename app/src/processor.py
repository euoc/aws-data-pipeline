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
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
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
    """Save DataFrame data to PostgreSQL table."""
    try:
        # Create a cursor
        cur = conn.cursor()
        
        # Create table if it doesn't exist (simplified example)
        # In production, you would define a more specific schema
        columns = ', '.join([f'"{col}" TEXT' for col in df.columns])
        create_table_query = f'CREATE TABLE IF NOT EXISTS {table_name} (id SERIAL PRIMARY KEY, {columns})'
        cur.execute(create_table_query)
        
        # Insert data
        for _, row in df.iterrows():
            # Escape values and create placeholders
            placeholders = ', '.join(['%s'] * len(row))
            columns = ', '.join([f'"{col}"' for col in df.columns])
            insert_query = f'INSERT INTO {table_name} ({columns}) VALUES ({placeholders})'
            cur.execute(insert_query, tuple(row))
        
        # Commit the transaction
        conn.commit()
        logger.info(f"Successfully saved {len(df)} rows to table {table_name}")
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