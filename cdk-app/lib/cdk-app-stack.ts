import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as path from 'path';
import * as assets from 'aws-cdk-lib/aws-ecr-assets';

export class CdkAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC for all resources
    const vpc = new ec2.Vpc(this, 'DataPipelineVPC', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }
      ]
    });

    // S3 Bucket for input data
    const dataBucket = new s3.Bucket(this, 'DataBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For demo purposes only - use RETAIN for production
      autoDeleteObjects: true, // For demo purposes only
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    // Security Group for RDS
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DBSecurityGroup', {
      vpc,
      description: 'Security group for RDS PostgreSQL database',
      allowAllOutbound: true,
    });

    // PostgreSQL Database
    const dbInstance = new rds.DatabaseInstance(this, 'PostgresDB', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_9,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MICRO // t3.micro is free tier eligible
      ),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],
      databaseName: 'datapipeline',
      credentials: rds.Credentials.fromGeneratedSecret('postgres'), // Secret will be stored in AWS Secrets Manager
      storageEncrypted: true,
      deletionProtection: false, // For demo purposes only - use true for production
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For demo purposes only - use RETAIN for production
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      backupRetention: cdk.Duration.days(7),
    });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'DataProcessingCluster', {
      vpc,
    });

    // Docker image for the container
    const dockerImage = new assets.DockerImageAsset(this, 'DataProcessorImage', {
      directory: path.join(__dirname, '../../app'),
    });

    // Task Definition with IAM Role
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'DataProcessorTask', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    // Grant the task IAM role read access to the S3 bucket
    dataBucket.grantRead(taskDefinition.taskRole);

    // Add the container to the task with environment variables
    const container = taskDefinition.addContainer('DataProcessorContainer', {
      image: ecs.ContainerImage.fromDockerImageAsset(dockerImage),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'data-processor' }),
      environment: {
        'S3_BUCKET': dataBucket.bucketName,
        'S3_PREFIX': 'data/',
        'DB_HOST': dbInstance.dbInstanceEndpointAddress,
        'DB_PORT': dbInstance.dbInstanceEndpointPort,
        'DB_NAME': 'datapipeline',
        'DB_USER': 'postgres',
      },
      secrets: {
        // Get DB password from the secret created by RDS
        'DB_PASSWORD': ecs.Secret.fromSecretsManager(dbInstance.secret!, 'password'),
      },
    });

    // Allow container security group to access the database
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'ECSSecurityGroup', {
      vpc,
      description: 'Security group for ECS tasks',
      allowAllOutbound: true,
    });

    // Allow ECS security group to connect to the database
    dbSecurityGroup.addIngressRule(
      ecsSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow ECS tasks to connect to RDS'
    );

    // Output the S3 bucket name and database endpoint for reference
    new cdk.CfnOutput(this, 'S3BucketName', {
      value: dataBucket.bucketName,
      description: 'The name of the S3 bucket for input data',
    });

    new cdk.CfnOutput(this, 'DBEndpoint', {
      value: dbInstance.dbInstanceEndpointAddress,
      description: 'The endpoint of the RDS PostgreSQL database',
    });

    new cdk.CfnOutput(this, 'DBSecretName', {
      value: dbInstance.secret!.secretName,
      description: 'The name of the secret containing database credentials',
    });
  }
}
