# Deploy RDS Instance - Quick Start

## Option 1: Run the Script (Recommended)

```bash
cd backend
./create-rds-now.sh
```

When prompted, enter your database password. The script will:
- Create the RDS instance
- Configure security groups
- Wait for it to be available
- Show you the endpoint
- Optionally save password to Parameter Store

## Option 2: Run with Password as Argument

```bash
cd backend
./create-rds-now.sh "your-password-here"
```

## Option 3: Manual AWS CLI Command

If you prefer to run it manually:

```bash
aws rds create-db-instance \
  --db-instance-identifier cachao-dev-db \
  --db-instance-class db.t3.micro \
  --engine mariadb \
  --engine-version 10.11.8 \
  --master-username admin \
  --master-user-password "YOUR_PASSWORD_HERE" \
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

Then wait for it to be available (5-10 minutes):

```bash
aws rds wait db-instance-available \
  --db-instance-identifier cachao-dev-db \
  --region eu-west-1 \
  --profile personal
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

Update security group to allow access:

```bash
# Get security group ID
SG_ID=$(aws rds describe-db-instances \
  --db-instance-identifier cachao-dev-db \
  --region eu-west-1 \
  --profile personal \
  --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' \
  --output text)

# Allow access from anywhere (dev only)
aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" \
  --protocol tcp \
  --port 3306 \
  --cidr 0.0.0.0/0 \
  --region eu-west-1 \
  --profile personal
```

## After RDS is Created

1. **Get the endpoint** (from script output or AWS CLI)
2. **Update template.yaml** - Replace all instances of:
   ```yaml
   DB_HOST: cachao-mdb-2.cetzgm3nbskt.eu-west-1.rds.amazonaws.com
   ```
   With your new endpoint:
   ```yaml
   DB_HOST: cachao-dev-db.xxxxxxxxx.rds.amazonaws.com
   ```

3. **Deploy**:
   ```bash
   sam build && sam deploy
   ```

## Cost

- **RDS t3.micro**: ~$15/month
- **No VPC costs**: $0
- **Total**: ~$15/month (vs $100-200/month before)




