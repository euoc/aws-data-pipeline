import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as path from 'path';

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

    // Security group for Lambda function
    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc,
      description: 'Security group for Lambda function',
      allowAllOutbound: true,
    });

    // Allow Lambda security group to connect to the database
    dbSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda function to connect to RDS'
    );
    
    // Lambda function for data processing using Docker container approach
    const dataProcessorLambda = new lambda.DockerImageFunction(this, 'DataProcessorFunction', {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../app'), {
        cmd: ['lambda_handler.handler'],
      }),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSecurityGroup],
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        'S3_BUCKET': dataBucket.bucketName,
        'S3_PREFIX': 'data/',
        'DB_HOST': dbInstance.dbInstanceEndpointAddress,
        'DB_PORT': dbInstance.dbInstanceEndpointPort,
        'DB_NAME': 'datapipeline',
        'DB_USER': 'postgres',
      },
    });

    // Grant Lambda function access to the RDS secret
    dbInstance.secret!.grantRead(dataProcessorLambda);

    // Grant Lambda function read access to the S3 bucket
    dataBucket.grantRead(dataProcessorLambda);

    // Add S3 event notification to trigger Lambda when a file is uploaded
    dataProcessorLambda.addEventSource(new lambdaEventSources.S3EventSource(dataBucket, {
      events: [s3.EventType.OBJECT_CREATED],
      filters: [{ prefix: 'data/' }]
    }));

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

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: dataProcessorLambda.functionName,
      description: 'The name of the Lambda function for data processing',
    });
    
    // Create a security group for the bastion host
    const bastionSecurityGroup = new ec2.SecurityGroup(this, 'BastionSecurityGroup', {
      vpc,
      description: 'Security group for Bastion Host',
      allowAllOutbound: true,
    });
    
    // Allow SSH access to the bastion from anywhere (you might want to restrict this to your IP)
    bastionSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH access from anywhere (for demo purposes)'
    );
    
    // Allow the bastion host to connect to the database
    dbSecurityGroup.addIngressRule(
      bastionSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Bastion Host to connect to RDS'
    );
    
    // Get the latest Amazon Linux 2 AMI
    const ami = new ec2.AmazonLinuxImage({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      cpuType: ec2.AmazonLinuxCpuType.X86_64,
    });
    
    // Create a key pair for SSH access
    const keyPair = new ec2.CfnKeyPair(this, 'BastionKeyPair', {
      keyName: 'bastion-key-pair',
    });
    
    // Make sure the key pair is deleted when the stack is deleted
    keyPair.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    
    // User data script to install PostgreSQL client and set up the environment
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'yum update -y',
      'amazon-linux-extras install postgresql14 -y',
      'yum install -y jq',
      'echo "export PGPASSWORD=\\$(aws secretsmanager get-secret-value --secret-id ' + dbInstance.secret!.secretName + ' --query SecretString --output text | jq -r \'.password\')" >> /home/ec2-user/.bashrc',
      'echo "alias connect-db=\'psql -h ' + dbInstance.dbInstanceEndpointAddress + ' -U postgres -d datapipeline\'" >> /home/ec2-user/.bashrc',
      'echo "AWS_SECRET_ID=' + dbInstance.secret!.secretName + '" >> /home/ec2-user/.env',
      'echo "DB_ENDPOINT=' + dbInstance.dbInstanceEndpointAddress + '" >> /home/ec2-user/.env'
    );
    
    // Create the EC2 instance for the bastion host
    const bastionHost = new ec2.Instance(this, 'BastionHost', {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO  // t2.micro is free tier eligible
      ),
      machineImage: ami,
      securityGroup: bastionSecurityGroup,
      keyName: keyPair.keyName,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      userData,
    });
    
    // Grant the bastion host permissions to read the RDS secret
    dbInstance.secret!.grantRead(bastionHost.role);
    
    // Output the bastion host's public DNS name and the key pair name
    new cdk.CfnOutput(this, 'BastionPublicDNS', {
      value: bastionHost.instancePublicDnsName,
      description: 'The public DNS name of the bastion host',
    });
    
    new cdk.CfnOutput(this, 'BastionKeyPairName', {
      value: keyPair.keyName,
      description: 'The name of the key pair for SSH access to the bastion host',
    });
    
    new cdk.CfnOutput(this, 'BastionSSHCommand', {
      value: `aws ec2-instance-connect send-ssh-public-key --instance-id ${bastionHost.instanceId} --availability-zone ${bastionHost.instanceAvailabilityZone} --instance-os-user ec2-user --ssh-public-key file://path/to/your/key.pub && ssh -i path/to/your/key ec2-user@${bastionHost.instancePublicDnsName}`,
      description: 'Command to connect to the bastion host via SSH (replace path/to/your/key with your actual key path)',
    });
  }
}
