# AWS Data Processing Pipeline

This project implements a serverless data processing pipeline using AWS free tier services. The pipeline ingests data from an S3 bucket, processes it using a containerized application, and stores the results in an RDS PostgreSQL database.

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
│   ├── docs/                 # Documentation
│   └── samples/              # Sample data files
└── docs/                     # Project documentation
```

## Features

- **Serverless Architecture**: Uses AWS services that scale automatically
- **Infrastructure as Code**: Entire infrastructure defined with AWS CDK
- **Security Best Practices**: Follows AWS security recommendations
- **Containerized Application**: Python-based data processor in Docker
- **Testing**: Includes unit tests for both infrastructure and application code

## Getting Started

### Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js
- npm or yarn
- Docker

### Setup and Deployment

1. Clone the repository
2. Install dependencies:
   ```
   cd aws-data-pipeline/cdk-app
   npm install
   ```
3. Build the project:
   ```
   npm run build
   ```
4. Deploy to AWS:
   ```
   npx cdk deploy
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
  ```
  cd aws-data-pipeline/cdk-app
  npm test
  ```
- Run application tests:
  ```
  cd aws-data-pipeline/app
  python -m pytest tests/
  ```

## Documentation

- Architecture diagrams and details: `aws-data-pipeline/docs/architecture.txt`
- Security implementation: `aws-data-pipeline/cdk-app/docs/SECURITY.md`
- Testing approach: `aws-data-pipeline/cdk-app/docs/TESTING.md`
