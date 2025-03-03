import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as CdkApp from '../lib/cdk-app-stack';

test('Data Pipeline Infrastructure Created', () => {
  const app = new cdk.App();
  // WHEN
  const stack = new CdkApp.CdkAppStack(app, 'MyTestStack');
  // THEN
  const template = Template.fromStack(stack);

  // Check if VPC is created
  template.resourceCountIs('AWS::EC2::VPC', 1);
  
  // Check if S3 bucket is created
  template.resourceCountIs('AWS::S3::Bucket', 1);
  
  // Check if RDS instance is created
  template.resourceCountIs('AWS::RDS::DBInstance', 1);
  
  // Check if ECS cluster is created
  template.resourceCountIs('AWS::ECS::Cluster', 1);
  
  // Check if Fargate task definition is created
  template.resourceCountIs('AWS::ECS::TaskDefinition', 1);
  
  // Check S3 bucket properties
  template.hasResourceProperties('AWS::S3::Bucket', {
    VersioningConfiguration: {
      Status: 'Enabled'
    },
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true
    }
  });
  
  // Check RDS instance properties
  template.hasResourceProperties('AWS::RDS::DBInstance', {
    Engine: 'postgres',
    StorageEncrypted: true
  });
});
