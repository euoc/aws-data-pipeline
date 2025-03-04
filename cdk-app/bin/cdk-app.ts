#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkAppStack } from '../lib/cdk-app-stack';
import * as dotenv from 'dotenv';

// Load environment variables from .env file if present
dotenv.config();

const app = new cdk.App();
new CdkAppStack(app, 'DataPipelineStack', {
  /* This stack will use the AWS profile specified in the AWS_PROFILE environment variable */
  /* If you want to explicitly specify an account, uncomment AWS_ACCOUNT_ID in your .env file */
  env: { 
    region: process.env.AWS_REGION || 'us-east-1'
  },
  
  /* Set default removal policy for the stack based on environment */
  terminationProtection: process.env.NODE_ENV === 'production',

  /* Add stack description */
  description: 'Data processing pipeline with S3, Lambda Container, and RDS PostgreSQL',

  /* Add tags for resource management */
  tags: {
    Environment: process.env.NODE_ENV || 'development',
    Project: 'DataPipeline',
    ManagedBy: 'CDK'
  }
});
