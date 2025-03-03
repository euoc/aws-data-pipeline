# AWS Data Processing Pipeline

This project implements a serverless data processing pipeline using AWS free tier services. The pipeline ingests data from an S3 bucket, processes it using a containerized application, and stores the results in an RDS PostgreSQL database.

## Architecture

![Architecture Diagram](docs/architecture.txt)

The solution uses the following AWS services:

- **Amazon S3**: Source data storage
- **Amazon ECS with Fargate**: Container orchestration for the processing application
- **Amazon RDS PostgreSQL**: Destination database
- **AWS Secrets Manager**: Secure storage of database credentials
- **Amazon VPC**: Network isolation for the resources
- **IAM Roles and Policies**: Secure access controls

## Infrastructure as Code

The infrastructure is defined using AWS CDK (Cloud Development Kit) in TypeScript, which generates CloudFormation templates.

Key components:
- VPC with public, private, and isolated subnets
- S3 bucket with encryption and versioning
- RDS PostgreSQL instance in a private subnet
- ECS Fargate task with the data processing container
- Security groups and IAM roles for least privilege access

## The Processing Application

The application is a Python-based service that:
1. Reads CSV files from the S3 bucket
2. Processes the data using pandas
3. Writes the results to PostgreSQL tables

## Getting Started

### Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 14.x or later
- npm or yarn
- Docker

### Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```

3. Build the project:
   ```
   npm run build
   ```

4. Deploy the stack:
   ```
   npx cdk deploy
   ```

### Test the Pipeline

1. Upload sample CSV files to the created S3 bucket:
   ```
   aws s3 cp samples/data.csv s3://your-bucket-name/data/
   ```

2. The ECS task will automatically process new files and store results in the RDS database

3. To check results in the database, use:
   ```
   psql -h <db-endpoint> -U postgres -d datapipeline
   ```

## Security Features

- S3 bucket with encryption, versioning, and public access blocked
- RDS PostgreSQL with storage encryption and proper security groups
- IAM roles with least privilege principle
- Secrets Manager for database credentials
- VPC isolated subnets for the database
- Security groups with restrictive ingress/egress rules

## Useful Commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
