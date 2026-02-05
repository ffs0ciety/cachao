# VPC Removal & Cost Optimization - Migration Complete ✅

## What Was Changed

### 1. Template.yaml Updates
- ✅ **Removed all VPC resources**:
  - `LambdaSecurityGroup`
  - `VPCEndpointSecurityGroup`
  - `S3VPCEndpoint`
  - `CognitoVPCEndpoint`
  - `LambdaVPCEndpoint`
  - `RDSSecurityGroupIngress`

- ✅ **Removed VpcConfig from all Lambda functions**:
  - `MigrateAddImageUrlFunction`
  - `MigrateAddAlbumsFunction`
  - `MigrateAddDateToAlbumsFunction`
  - `MigrateAddEventStaffFunction`
  - `MigrateAddFlightsFunction`
  - `MigrateAddUsersFunction`
  - `MigrateAddThumbnailFunction`
  - `DeleteAllVideosFunction`
  - `EventsFunction`

### 2. Code Updates
- ✅ **Updated database connection code** in all Lambda functions to enable SSL for RDS:
  - `events-function/app.ts`
  - `generate-thumbnail/generate-thumbnail.ts`
  - `create-user-function/create-user.ts`
  - `migrate-add-*` functions
  - `delete-videos-function/app.ts`

- ✅ **Simplified Cognito client** in `events-function/app.ts`:
  - Removed VPC endpoint configuration
  - Now uses direct internet access (no VPC needed)

## Next Steps

### 1. Create RDS Instance (Non-Aurora)

Run the provided script to create a cost-effective RDS instance:

```bash
cd backend
./create-cost-effective-rds.sh
```

Or manually create using AWS CLI:

```bash
aws rds create-db-instance \
  --db-instance-identifier cachao-dev-db \
  --db-instance-class db.t3.micro \
  --engine mariadb \
  --engine-version 10.11.8 \
  --master-username admin \
  --master-user-password YOUR_PASSWORD \
  --allocated-storage 20 \
  --storage-type gp2 \
  --db-name cachao \
  --publicly-accessible \
  --backup-retention-period 0 \
  --no-multi-az \
  --no-storage-encrypted \
  --region eu-west-1 \
  --profile personal
```

**Note**: For production, use:
- `--no-publicly-accessible` (private)
- `--storage-encrypted`
- `--backup-retention-period 7`
- `--multi-az` (for HA)

### 2. Update Security Group

After RDS instance is created, update its security group to allow Lambda access:

```bash
# Get the security group ID from RDS instance
SECURITY_GROUP_ID=$(aws rds describe-db-instances \
  --db-instance-identifier cachao-dev-db \
  --region eu-west-1 \
  --profile personal \
  --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' \
  --output text)

# Allow access from anywhere (for dev only - restrict in production)
aws ec2 authorize-security-group-ingress \
  --group-id "$SECURITY_GROUP_ID" \
  --protocol tcp \
  --port 3306 \
  --cidr 0.0.0.0/0 \
  --region eu-west-1 \
  --profile personal
```

### 3. Update DB_HOST in template.yaml

Once you have the RDS endpoint, update all `DB_HOST` environment variables in `template.yaml`:

```yaml
Environment:
  Variables:
    DB_HOST: your-new-rds-endpoint.rds.amazonaws.com  # UPDATE THIS
    DB_PORT: "3306"
    DB_NAME: cachao
    DB_USER: !Ref DatabaseUser
    DB_PASSWORD: !Ref DatabasePassword
```

Get the endpoint:
```bash
aws rds describe-db-instances \
  --db-instance-identifier cachao-dev-db \
  --region eu-west-1 \
  --profile personal \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text
```

### 4. Migrate Data (if needed)

If you have existing data in Aurora, export and import it:

```bash
# Export from Aurora
mysqldump -h old-aurora-endpoint.rds.amazonaws.com \
  -u admin -p \
  cachao > backup.sql

# Import to new RDS
mysql -h new-rds-endpoint.rds.amazonaws.com \
  -u admin -p \
  cachao < backup.sql
```

### 5. Deploy Updated Stack

```bash
cd backend
sam build
sam deploy
```

### 6. Test the Application

Verify all endpoints work correctly:
- Test database connections
- Test API endpoints
- Verify Lambda functions can access RDS
- Verify Cognito still works

### 7. Clean Up Old Resources (Optional)

Once everything is working:
- Delete old Aurora instance (if no longer needed)
- Delete old VPC endpoints (if they were created separately)
- Monitor costs to verify savings

## Cost Savings

| Item | Before | After | Savings |
|------|--------|-------|---------|
| Database | Aurora (~$50-100/month) | RDS t3.micro (~$15/month) | ~$35-85/month |
| VPC Endpoints | ~$20-30/month | $0 | ~$20-30/month |
| ENI Charges | ~$5-10/month | $0 | ~$5-10/month |
| **Total** | **~$100-200/month** | **~$15/month** | **~85-90%** |

## Important Notes

1. **Public Accessibility**: The RDS instance is publicly accessible for development. **For production**, move it to a private subnet and use VPC or RDS Proxy.

2. **Security Groups**: Currently allows access from anywhere (0.0.0.0/0). **For production**, restrict to specific IP ranges or use security groups.

3. **Backups**: Backups are disabled for cost savings. **For production**, enable automated backups.

4. **SSL**: SSL is enabled but with `rejectUnauthorized: false` for development. **For production**, use proper SSL certificates.

5. **Monitoring**: Set up CloudWatch alarms to monitor RDS performance and costs.

## Troubleshooting

### Connection Issues
- Verify security group allows port 3306
- Check RDS instance is publicly accessible
- Verify DB_HOST, DB_USER, DB_PASSWORD are correct
- Check CloudWatch logs for connection errors

### Lambda Timeout
- Lambda functions no longer in VPC should have faster cold starts
- If timeouts occur, increase Lambda timeout in template.yaml

### Cognito Issues
- Cognito should work without VPC endpoints
- Verify IAM permissions are correct
- Check CloudWatch logs for Cognito errors

## Support

If you encounter issues:
1. Check CloudWatch logs for Lambda functions
2. Check RDS CloudWatch metrics
3. Verify security group rules
4. Test database connection manually using `mariadb` client




