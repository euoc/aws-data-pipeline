# AWS Data Processing Pipeline

This project implements a serverless data processing pipeline using AWS free tier services. The pipeline ingests data from an S3 bucket, processes it using a containerized application, and stores the results in an RDS PostgreSQL database.

## Architecture

The solution uses the following AWS services:

- **Amazon S3**: Source data storage
- **AWS Lambda**: Serverless function for data processing
- **Amazon RDS PostgreSQL**: Destination database
- **AWS Secrets Manager**: Secure storage of database credentials
- **Amazon VPC**: Network isolation for the resources
- **IAM Roles and Policies**: Secure access controls

For architecture details, see the documentation section below.

## Project Structure

The project is organized as follows:

```
aws-data-pipeline/
├── app/                      # Processing application
│   ├── Dockerfile            # Docker container definition
│   ├── requirements.txt      # Python dependencies
│   ├── src/                  # Application source code
│   │   └── processor.py      # Data processing logic
│   └── tests/                # Application tests
│       └── unit/
│           └── test_processor.py
├── cdk-app/                  # CDK infrastructure code
│   ├── bin/                  # CDK application entry point
│   ├── lib/                  # CDK stack definition
│   ├── test/                 # Infrastructure tests
│   └── samples/              # Sample data files
└── docs/                     # Project documentation
```

## Features

- **Serverless Architecture**: Uses AWS services that scale automatically
- **Infrastructure as Code**: Entire infrastructure defined with AWS CDK
- **Security Best Practices**: Follows AWS security recommendations
- **Serverless Processing**: Python-based data processor using AWS Lambda
- **Testing**: Includes unit tests for both infrastructure and application code

## Getting Started

### Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 14.x or later
- npm or yarn
- Python 3.9 (for local testing)

### AWS Configuration Setup

1. Configure your AWS profile:
   ```bash
   aws configure --profile your-profile-name
   # Enter your AWS Access Key ID, Secret Access Key, region (e.g., us-east-1)
   ```

2. Create a `.env` file in the cdk-app directory:
   ```bash
   cd aws-data-pipeline/cdk-app
   cp .env.example .env
   ```

3. Edit the `.env` file to include your AWS profile:
   ```
   AWS_PROFILE=your-profile-name
   AWS_REGION=us-east-1
   NODE_ENV=development
   ```

### Deployment Steps

1. Install dependencies:
   ```bash
   cd aws-data-pipeline/cdk-app
   npm install
   ```

2. Bootstrap your AWS environment (only needed once per AWS account/region):
   ```bash
   npm run bootstrap
   # Or with a specific profile:
   AWS_PROFILE=your-profile-name
   npm run bootstrap
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Deploy to AWS:
   ```bash
   npm run deploy
   # Or with a specific profile:
   AWS_PROFILE=your-profile-name
   npm run deploy
   ```

### Test the Pipeline

1. Note the outputs from the deployment (S3 bucket name, database endpoint)

2. Upload sample CSV files to the "data/" folder in the S3 bucket. The Lambda function is triggered by S3 "ObjectCreated" events for files in this prefix:
   ```bash
   # Upload a new file
   aws s3 cp cdk-app/samples/data.csv s3://your-bucket-name/data/ --profile your-profile-name
   
   # Or update an existing file (will also trigger the Lambda)
   aws s3 cp cdk-app/samples/data.csv s3://your-bucket-name/data/data.csv --profile your-profile-name
   ```

3. The Lambda function will automatically process new files when they're uploaded to S3. Note that:
   - Files must be in the "data/" prefix to trigger the function
   - Each file upload (new or overwrite) triggers a separate Lambda execution
   - The filename (without extension) is used as the database table name
   - Data is intelligently merged using PostgreSQL's UPSERT functionality
   - Duplicate records (with the same ID or email) will be updated, not duplicated

   You can monitor Lambda executions:
   ```bash
   # Get the Lambda function logs
   aws logs get-log-events \
     --log-group-name /aws/lambda/DataPipelineStack-DataProcessorFunction \
     --log-stream-name $(aws logs describe-log-streams \
       --log-group-name /aws/lambda/DataPipelineStack-DataProcessorFunction \
       --order-by LastEventTime \
       --descending \
       --limit 1 \
       --query 'logStreams[0].logStreamName' \
       --output text \
       --profile your-profile-name) \
     --profile your-profile-name
   ```

4. Check the database results:
   ```bash
   # Get the database password from Secrets Manager
   aws secretsmanager get-secret-value --secret-id DATABASE_SECRET_NAME --query SecretString --output text --profile your-profile-name
   
   # Connect to the database
   psql -h DB_ENDPOINT -U postgres -d datapipeline
   # Enter the password when prompted
   
   # Once connected, view the data
   SELECT * FROM data LIMIT 10;
   ```

## Security Features

- S3 bucket with encryption, versioning, and public access blocked
- RDS PostgreSQL with storage encryption and proper security groups
- IAM roles with least privilege principle
- Secrets Manager for database credentials
- VPC isolated subnets for the database
- Security groups with restrictive ingress/egress rules

## Testing

- Run infrastructure tests:
  ```bash
  cd aws-data-pipeline/cdk-app
  npm test
  ```
- Run application tests:
  ```bash
  cd aws-data-pipeline/app
  python -m pytest tests/
  ```

## Useful Commands

* `npm run build`     compile TypeScript to JavaScript
* `npm run watch`     watch for changes and compile
* `npm run test`      perform the Jest unit tests
* `npm run bootstrap` bootstrap AWS environment for CDK
* `npm run deploy`    deploy the stack to AWS
* `npm run diff`      compare deployed stack with current state
* `npm run synth`     emit the synthesized CloudFormation template
* `npm run destroy`   destroy the deployed stack

## Documentation

- Security implementation: `docs/SECURITY.md`
- Testing approach: `docs/TESTING.md`
- Architecture details: `docs/architecture.txt`
