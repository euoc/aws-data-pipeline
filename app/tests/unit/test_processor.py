import unittest
from unittest.mock import patch, MagicMock
import pandas as pd
import io
import sys
import os

# Add the src directory to the path so we can import processor
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../src')))

import processor

class TestProcessor(unittest.TestCase):
    
    def setUp(self):
        """Set up test fixtures."""
        # Mock environment variables
        self.env_patcher = patch.dict('os.environ', {
            'S3_BUCKET': 'test-bucket',
            'S3_PREFIX': 'data/',
            'DB_HOST': 'test-db-host',
            'DB_PORT': '5432',
            'DB_NAME': 'test-db',
            'DB_USER': 'test-user',
            'DB_PASSWORD': 'test-password'
        })
        self.env_patcher.start()
        
    def tearDown(self):
        """Tear down test fixtures."""
        self.env_patcher.stop()
    
    @patch('boto3.client')
    def test_get_s3_client(self, mock_boto3_client):
        """Test the S3 client creation."""
        mock_s3_client = MagicMock()
        mock_boto3_client.return_value = mock_s3_client
        
        # Call the function
        result = processor.get_s3_client()
        
        # Assert boto3.client was called with 's3'
        mock_boto3_client.assert_called_once_with('s3')
        # Assert the function returns what boto3.client returns
        self.assertEqual(result, mock_s3_client)
    
    @patch('psycopg2.connect')
    def test_get_db_connection(self, mock_connect):
        """Test database connection creation."""
        mock_connection = MagicMock()
        mock_connect.return_value = mock_connection
        
        # Call the function
        result = processor.get_db_connection()
        
        # Assert psycopg2.connect was called with correct parameters
        mock_connect.assert_called_once_with(
            host='test-db-host',
            port='5432',
            dbname='test-db',
            user='test-user',
            password='test-password'
        )
        
        # Assert the function returns what psycopg2.connect returns
        self.assertEqual(result, mock_connection)
    
    @patch('boto3.client')
    def test_process_csv_file(self, mock_boto3_client):
        """Test CSV file processing from S3."""
        # Mock S3 client and response
        mock_s3_client = MagicMock()
        mock_boto3_client.return_value = mock_s3_client
        
        # Create sample CSV content
        csv_content = 'id,name,value\n1,test1,100\n2,test2,200'
        mock_body = MagicMock()
        mock_body.read.return_value = csv_content.encode('utf-8')
        
        mock_s3_client.get_object.return_value = {
            'Body': mock_body
        }
        
        # Call the function
        result = processor.process_csv_file(mock_s3_client, 'test-bucket', 'test-key.csv')
        
        # Assert the S3 client method was called correctly
        mock_s3_client.get_object.assert_called_once_with(
            Bucket='test-bucket', 
            Key='test-key.csv'
        )
        
        # Assert the result is a DataFrame with expected data
        pd.testing.assert_frame_equal(
            result,
            pd.DataFrame({
                'id': [1, 2],
                'name': ['test1', 'test2'],
                'value': [100, 200]
            })
        )
    
    def test_save_to_postgres(self):
        """Test saving data to PostgreSQL."""
        # Create a mock connection and cursor
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        
        # Create a sample DataFrame
        df = pd.DataFrame({
            'id': [1, 2],
            'name': ['test1', 'test2'],
            'value': [100, 200]
        })
        
        # Call the function
        processor.save_to_postgres(df, 'test_table', mock_conn)
        
        # Assert cursor was created
        mock_conn.cursor.assert_called_once()
        
        # Assert that CREATE TABLE was executed
        create_table_call = mock_cursor.execute.call_args_list[0]
        self.assertIn('CREATE TABLE IF NOT EXISTS test_table', create_table_call[0][0])
        
        # Assert that there were 2 INSERT calls (one for each row in the DataFrame)
        self.assertEqual(mock_cursor.execute.call_count, 3)  # 1 CREATE + 2 INSERTs
        
        # Assert that commit was called once
        mock_conn.commit.assert_called_once()
        
        # Assert that cursor close was called
        mock_cursor.close.assert_called_once()

if __name__ == '__main__':
    unittest.main()