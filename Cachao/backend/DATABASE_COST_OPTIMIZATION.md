# Database Cost Optimization Guide

## Current Setup (Expensive)
- **Aurora DB** (MariaDB) in VPC
- **VPC Endpoints** (S3, Cognito, Lambda) - ~$7-10/month each
- **Lambda in VPC** - ENI charges + cold start delays
- **Total Cost**: ~$100-200/month for development

## Recommended: RDS MySQL/MariaDB (Non-Aurora) + No VPC

### Cost Savings
- **RDS db.t3.micro**: ~$15/month (vs Aurora ~$50-100/month)
- **No VPC Endpoints**: Save ~$20-30/month
- **No ENI charges**: Save ~$5-10/month
- **Total**: ~$15/month (vs $100-200/month) = **85-90% savings**

### Migration Steps

#### 1. Create RDS Instance (Non-Aurora)

```bash
# Create RDS MySQL/MariaDB instance (outside VPC, publicly accessible for dev)
aws rds create-db-instance \
  --db-instance-identifier cachao-dev-db \
  --db-instance-class db.t3.micro \
  --engine mariadb \
  --engine-version 10.11.8 \
  --master-username admin \
  --master-user-password YOUR_PASSWORD \
  --allocated-storage 20 \
  --storage-type gp2 \
  --publicly-accessible \
  --backup-retention-period 0 \
  --no-multi-az \
  --no-storage-encrypted \
  --region eu-west-1
```

**Important**: For production, use:
- `--no-publicly-accessible` (private)
- `--storage-encrypted`
- `--backup-retention-period 7`
- `--multi-az` (for HA)

#### 2. Update Security Group

Allow Lambda IP ranges or use AWS Lambda's IP ranges:
```bash
# Get your Lambda execution IP ranges (or use 0.0.0.0/0 for dev only)
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp \
  --port 3306 \
  --cidr 0.0.0.0/0  # DEV ONLY - restrict in production
```

#### 3. Update template.yaml

Remove VPC configuration from Lambda functions:

```yaml
EventsFunction:
  Type: AWS::Serverless::Function
  Properties:
    # REMOVE VpcConfig section entirely
    # VpcConfig:  # DELETE THIS
    #   SubnetIds: [...]
    #   SecurityGroupIds: [...]
    Environment:
      Variables:
        DB_HOST: your-new-rds-endpoint.rds.amazonaws.com
        DB_PORT: "3306"
        DB_NAME: cachao
        DB_USER: !Ref DatabaseUser
        DB_PASSWORD: !Ref DatabasePassword
```

#### 4. Remove VPC Endpoints

Delete these resources from `template.yaml`:
- `S3VPCEndpoint` (S3 works without VPC)
- `CognitoVPCEndpoint` (Cognito works without VPC)
- `LambdaVPCEndpoint` (Lambda works without VPC)
- `LambdaSecurityGroup`
- `VPCEndpointSecurityGroup`
- `RDSSecurityGroupIngress`

#### 5. Update Database Connection Code

Your existing code should work as-is, but ensure SSL is enabled:

```typescript
pool = mariadb.createPool({
  host,
  port,
  user,
  password,
  database,
  connectionLimit: 20,
  ssl: {
    rejectUnauthorized: false  // For RDS, use proper CA in production
  },
  connectTimeout: 10000,
  acquireTimeout: 15000,
  idleTimeout: 300000,
  minimumIdle: 2,
});
```

### Alternative: RDS Serverless v2

For even better cost optimization (scales to zero when idle):

```bash
aws rds create-db-cluster \
  --db-cluster-identifier cachao-dev-cluster \
  --engine mariadb \
  --engine-version 10.11.8 \
  --master-username admin \
  --master-user-password YOUR_PASSWORD \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=2 \
  --publicly-accessible \
  --region eu-west-1

aws rds create-db-instance \
  --db-instance-identifier cachao-dev-instance \
  --db-instance-class db.serverless \
  --engine mariadb \
  --db-cluster-identifier cachao-dev-cluster \
  --publicly-accessible
```

**Cost**: ~$0.10/hour when active, $0 when idle (after 5 minutes)

## Option 2: PlanetScale (Serverless MySQL)

### Benefits
- **Free tier**: 1 database, 1GB storage, 1 billion reads/month
- **Serverless**: Scales automatically
- **Branching**: Database branching for dev/staging
- **MySQL compatible**: Minimal code changes

### Migration Steps

1. Sign up at [planetscale.com](https://planetscale.com)
2. Create a database
3. Get connection string
4. Update environment variables:
   ```bash
   DB_HOST: your-db.psdb.cloud
   DB_PORT: 3306
   DB_USER: your-user
   DB_PASSWORD: your-password
   DB_NAME: your-db
   ```
5. Enable SSL in connection (required):
   ```typescript
   ssl: {
     rejectUnauthorized: true
   }
   ```

## Option 3: Neon (Serverless PostgreSQL)

If you're open to PostgreSQL:

1. Sign up at [neon.tech](https://neon.tech)
2. Free tier: 0.5GB storage, unlimited projects
3. Requires code changes (PostgreSQL instead of MySQL)

## Cost Comparison

| Option | Monthly Cost (Dev) | Production Ready | Code Changes |
|--------|-------------------|------------------|--------------|
| **Current (Aurora + VPC)** | $100-200 | ✅ | None |
| **RDS t3.micro (No VPC)** | $15-20 | ✅ | Minimal |
| **RDS Serverless v2** | $5-15 | ✅ | Minimal |
| **PlanetScale** | $0-30 | ✅ | Minimal |
| **Neon** | $0-25 | ✅ | Moderate (PostgreSQL) |

## Recommended Action Plan

1. **Immediate (Dev)**: Switch to RDS t3.micro + remove VPC
   - 90% cost reduction
   - No code changes needed
   - Can migrate in 1-2 hours

2. **Future (Production)**: 
   - Use RDS with VPC (private subnet)
   - Or use RDS Proxy for connection pooling
   - Or use PlanetScale for serverless scaling

## Migration Checklist

- [ ] Create new RDS instance (non-Aurora)
- [ ] Export data from Aurora
- [ ] Import data to new RDS
- [ ] Update `template.yaml` (remove VPC configs)
- [ ] Update environment variables
- [ ] Test Lambda functions
- [ ] Update security groups
- [ ] Delete old Aurora instance
- [ ] Delete VPC endpoints
- [ ] Monitor costs

## Notes

- **Public accessibility**: Only for development. For production, use private subnets with VPC.
- **Backup**: Enable backups for production (adds ~$2-5/month)
- **Monitoring**: Use CloudWatch for RDS metrics (free tier available)
- **Connection pooling**: Consider RDS Proxy for production (adds ~$15/month but improves performance)




