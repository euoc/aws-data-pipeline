import json
import os
import logging
import processor

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    """
    Lambda function handler that processes S3 events.
    
    Args:
        event: The event from S3 trigger
        context: Lambda execution context
    
    Returns:
        Response object
    """
    logger.info("Processing S3 event: %s", json.dumps(event))
    
    try:
        # Get bucket and key information from the S3 event
        for record in event.get('Records', []):
            if record.get('eventSource') == 'aws:s3' and record.get('eventName').startswith('ObjectCreated:'):
                bucket = record['s3']['bucket']['name']
                key = record['s3']['object']['key']
                
                logger.info(f"Processing file {key} from bucket {bucket}")
                
                # Initialize S3 client
                s3_client = processor.get_s3_client()
                
                # Process the CSV file
                df = processor.process_csv_file(s3_client, bucket, key)
                
                # Connect to database
                conn = processor.get_db_connection()
                
                # Use the filename (without extension) as the table name
                table_name = os.path.basename(key).split('.')[0]
                
                # Save to PostgreSQL
                processor.save_to_postgres(df, table_name, conn)
                
                # Close the database connection
                conn.close()
                
                logger.info(f"Successfully processed file {key} and saved to table {table_name}")
        
        return {
            'statusCode': 200,
            'body': json.dumps('Processing completed successfully')
        }
    
    except Exception as e:
        logger.error(f"Error processing S3 event: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error processing: {str(e)}')
        }