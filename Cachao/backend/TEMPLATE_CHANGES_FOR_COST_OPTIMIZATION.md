# Template Changes for Cost Optimization

This document shows exactly what to remove from `template.yaml` to eliminate VPC costs.

## Resources to DELETE (Lines 33-129)

Remove these entire sections from `template.yaml`:

### 1. LambdaSecurityGroup (Lines 33-41)
```yaml
# DELETE THIS ENTIRE SECTION
LambdaSecurityGroup:
  Type: AWS::EC2::SecurityGroup
  Properties:
    GroupDescription: Security group for Lambda functions to access RDS
    VpcId: vpc-0d225875adfdab062
    SecurityGroupEgress:
      - IpProtocol: -1
        CidrIp: 0.0.0.0/0
        Description: Allow all outbound traffic
```

### 2. VPCEndpointSecurityGroup (Lines 43-51)
```yaml
# DELETE THIS ENTIRE SECTION
VPCEndpointSecurityGroup:
  Type: AWS::EC2::SecurityGroup
  Properties:
    GroupDescription: Security group for VPC endpoints to allow Lambda access
    VpcId: vpc-0d225875adfdab062
    SecurityGroupIngress:
      - IpProtocol: -1
        SourceSecurityGroupId: !Ref LambdaSecurityGroup
        Description: Allow all traffic from Lambda security group
```

### 3. S3VPCEndpoint (Lines 56-75)
```yaml
# DELETE THIS ENTIRE SECTION
S3VPCEndpoint:
  Type: AWS::EC2::VPCEndpoint
  Properties:
    VpcId: vpc-0d225875adfdab062
    ServiceName: !Sub 'com.amazonaws.${AWS::Region}.s3'
    VpcEndpointType: Gateway
    RouteTableIds:
      - rtb-029daadcd450bf586
    PolicyDocument:
      Statement:
        - Effect: Allow
          Principal: '*'
          Action:
            - s3:GetObject
            - s3:PutObject
            - s3:DeleteObject
            - s3:ListBucket
          Resource:
            - !Sub 'arn:aws:s3:::${CachaoVideosBucket}'
            - !Sub 'arn:aws:s3:::${CachaoVideosBucket}/*'
```

### 4. CognitoVPCEndpoint (Lines 78-98)
```yaml
# DELETE THIS ENTIRE SECTION
CognitoVPCEndpoint:
  Type: AWS::EC2::VPCEndpoint
  Properties:
    VpcId: vpc-0d225875adfdab062
    ServiceName: !Sub 'com.amazonaws.${AWS::Region}.cognito-idp'
    VpcEndpointType: Interface
    SubnetIds:
      - subnet-080f4e74fb1394a59
      - subnet-0acb83cf534753008
      - subnet-08636add6c80c21ff
    SecurityGroupIds:
      - !Ref VPCEndpointSecurityGroup
    PolicyDocument:
      Statement:
        - Effect: Allow
          Principal: '*'
          Action:
            - cognito-idp:AdminCreateUser
            - cognito-idp:AdminGetUser
            - cognito-idp:ListUsers
          Resource: '*'
```

### 5. LambdaVPCEndpoint (Lines 101-119)
```yaml
# DELETE THIS ENTIRE SECTION
LambdaVPCEndpoint:
  Type: AWS::EC2::VPCEndpoint
  Properties:
    VpcId: vpc-0d225875adfdab062
    ServiceName: !Sub 'com.amazonaws.${AWS::Region}.lambda'
    VpcEndpointType: Interface
    SubnetIds:
      - subnet-080f4e74fb1394a59
      - subnet-0acb83cf534753008
      - subnet-08636add6c80c21ff
    SecurityGroupIds:
      - !Ref VPCEndpointSecurityGroup
    PolicyDocument:
      Statement:
        - Effect: Allow
          Principal: '*'
          Action:
            - lambda:InvokeFunction
          Resource: '*'
```

### 6. RDSSecurityGroupIngress (Lines 121-129)
```yaml
# DELETE THIS ENTIRE SECTION
RDSSecurityGroupIngress:
  Type: AWS::EC2::SecurityGroupIngress
  Properties:
    GroupId: sg-06bfca9a55bf25b08
    IpProtocol: tcp
    FromPort: 3306
    ToPort: 3306
    SourceSecurityGroupId: !Ref LambdaSecurityGroup
    Description: Allow MySQL access from Lambda security group
```

## Lambda Functions - Remove VpcConfig

For each Lambda function that has `VpcConfig`, remove that entire section.

### Example: EventsFunction (Lines 636-642)

**BEFORE:**
```yaml
EventsFunction:
  Type: AWS::Serverless::Function
  Properties:
    CodeUri: events-function/
    Handler: app.lambdaHandler
    Runtime: nodejs20.x
    Timeout: 60
    MemorySize: 512
    VpcConfig:                    # DELETE THIS
      SubnetIds:                  # DELETE THIS
        - subnet-080f4e74fb1394a59 # DELETE THIS
        - subnet-0acb83cf534753008 # DELETE THIS
        - subnet-08636add6c80c21ff # DELETE THIS
      SecurityGroupIds:           # DELETE THIS
        - !Ref LambdaSecurityGroup # DELETE THIS
    Environment:
      Variables:
        DB_HOST: cachao-mdb-2.cetzgm3nbskt.eu-west-1.rds.amazonaws.com
        # ... rest of config
```

**AFTER:**
```yaml
EventsFunction:
  Type: AWS::Serverless::Function
  Properties:
    CodeUri: events-function/
    Handler: app.lambdaHandler
    Runtime: nodejs20.x
    Timeout: 60
    MemorySize: 512
    # VpcConfig removed - Lambda can access RDS directly via internet
    Environment:
      Variables:
        DB_HOST: your-new-rds-endpoint.rds.amazonaws.com  # UPDATE THIS
        # ... rest of config
```

### Functions to Update:

1. **MigrateAddImageUrlFunction** (Lines 235-241)
2. **MigrateAddAlbumsFunction** (Lines 275-281)
3. **MigrateAddDateToAlbumsFunction** (Lines 315-321)
4. **MigrateAddEventStaffFunction** (Lines 355-361)
5. **MigrateAddFlightsFunction** (Lines 395-401)
6. **MigrateAddUsersFunction** (Lines 435-441)
7. **MigrateAddThumbnailFunction** (Lines 475-481)
8. **DeleteAllVideosFunction** (Lines 595-601)
9. **EventsFunction** (Lines 636-642)

### Functions that DON'T need changes:

- **HelloWorldFunction** - Already has no VPC
- **CreateUserFunction** - Already has no VPC (line 515 comment confirms)
- **GenerateThumbnailFunction** - Already has no VPC (line 552 comment confirms)

## Update Database Connection Code

In `events-function/app.ts` and other Lambda functions, update the SSL configuration:

**BEFORE:**
```typescript
const isLocal = host === 'host.docker.internal' || host === 'localhost' || host === '127.0.0.1';

pool = mariadb.createPool({
  host,
  port,
  user,
  password,
  database,
  connectionLimit: 20,
  ssl: isLocal ? false : undefined,  // CHANGE THIS
  allowPublicKeyRetrieval: isLocal,
  // ...
});
```

**AFTER:**
```typescript
const isLocal = host === 'host.docker.internal' || host === 'localhost' || host === '127.0.0.1';

pool = mariadb.createPool({
  host,
  port,
  user,
  password,
  database,
  connectionLimit: 20,
  ssl: isLocal ? false : { rejectUnauthorized: false },  // Enable SSL for RDS
  allowPublicKeyRetrieval: isLocal,
  // ...
});
```

## Update Cognito Client (if needed)

In `events-function/app.ts` (around line 91-100), you can simplify the Cognito client:

**BEFORE:**
```typescript
function getCognitoClient(): CognitoIdentityProviderClient {
  if (!cognitoClient) {
    const endpoint = process.env.COGNITO_VPC_ENDPOINT || 
      'vpce-0231ea26a969a5d3c-mmandh2w.cognito-idp.eu-west-1.vpce.amazonaws.com';
    
    cognitoClient = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'eu-west-1',
      // ... endpoint config
    });
  }
  return cognitoClient;
}
```

**AFTER:**
```typescript
function getCognitoClient(): CognitoIdentityProviderClient {
  if (!cognitoClient) {
    // No VPC endpoint needed - Cognito works directly via internet
    cognitoClient = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'eu-west-1',
    });
  }
  return cognitoClient;
}
```

## Summary

**Total lines to remove**: ~100 lines
**Resources to delete**: 6 (security groups and VPC endpoints)
**Lambda functions to update**: 9 (remove VpcConfig)
**Code changes**: Minimal (SSL config, Cognito client)

**Estimated time**: 30-60 minutes
**Cost savings**: ~85-90% ($100-200/month → $15/month)




