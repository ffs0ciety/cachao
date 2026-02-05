#!/bin/bash
# Script to create a cost-effective RDS instance for development
# This replaces expensive Aurora DB with standard RDS MySQL/MariaDB

set -e

# Configuration
DB_INSTANCE_ID="cachao-dev-db"
DB_NAME="cachao"
DB_USER="admin"
REGION="eu-west-1"
INSTANCE_CLASS="db.t3.micro"  # Change to db.t4g.micro for ARM (cheaper)

echo "🚀 Creating cost-effective RDS instance for development"
echo ""
echo "This will create:"
echo "  - RDS MariaDB instance (non-Aurora)"
echo "  - Instance class: $INSTANCE_CLASS (~\$15/month)"
echo "  - Publicly accessible (for dev only)"
echo "  - No backups (for dev only)"
echo ""

# Prompt for password
read -sp "Enter database password: " DB_PASSWORD
echo ""
read -sp "Confirm database password: " DB_PASSWORD_CONFIRM
echo ""

if [ "$DB_PASSWORD" != "$DB_PASSWORD_CONFIRM" ]; then
  echo "❌ Passwords do not match!"
  exit 1
fi

# Check if instance already exists
if aws rds describe-db-instances --db-instance-identifier "$DB_INSTANCE_ID" --region "$REGION" &>/dev/null; then
  echo "⚠️  Instance $DB_INSTANCE_ID already exists!"
  read -p "Do you want to delete it and create a new one? (yes/no): " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 1
  fi
  echo "Deleting existing instance..."
  aws rds delete-db-instance \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --skip-final-snapshot \
    --region "$REGION" \
    --profile personal 2>/dev/null || true
  
  echo "Waiting for deletion to complete..."
  aws rds wait db-instance-deleted \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --region "$REGION" \
    --profile personal || true
fi

echo ""
echo "📦 Creating RDS instance..."
echo "   This may take 5-10 minutes..."

# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --db-instance-class "$INSTANCE_CLASS" \
  --engine mariadb \
  --engine-version 10.11.8 \
  --master-username "$DB_USER" \
  --master-user-password "$DB_PASSWORD" \
  --allocated-storage 20 \
  --storage-type gp2 \
  --db-name "$DB_NAME" \
  --publicly-accessible \
  --backup-retention-period 0 \
  --no-multi-az \
  --no-storage-encrypted \
  --region "$REGION" \
  --profile personal

echo ""
echo "⏳ Waiting for instance to be available..."
aws rds wait db-instance-available \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --region "$REGION" \
  --profile personal

# Get endpoint
DB_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --region "$REGION" \
  --profile personal \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

# Get security group
SECURITY_GROUP_ID=$(aws rds describe-db-instances \
  --db-instance-identifier "$DB_INSTANCE_ID" \
  --region "$REGION" \
  --profile personal \
  --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' \
  --output text)

echo ""
echo "✅ RDS instance created successfully!"
echo ""
echo "📋 Connection Details:"
echo "   Endpoint: $DB_ENDPOINT"
echo "   Port: 3306"
echo "   Database: $DB_NAME"
echo "   Username: $DB_USER"
echo "   Security Group: $SECURITY_GROUP_ID"
echo ""

# Update security group to allow Lambda access
echo "🔓 Updating security group to allow Lambda access..."
echo "   Note: This allows access from anywhere (0.0.0.0/0)"
echo "   For production, restrict this to specific IP ranges"

# Check if rule already exists
EXISTING_RULE=$(aws ec2 describe-security-groups \
  --group-ids "$SECURITY_GROUP_ID" \
  --region "$REGION" \
  --profile personal \
  --query "SecurityGroups[0].IpPermissions[?FromPort==\`3306\` && ToPort==\`3306\`]" \
  --output json)

if [ "$EXISTING_RULE" != "[]" ]; then
  echo "   Security group rule already exists, skipping..."
else
  aws ec2 authorize-security-group-ingress \
    --group-id "$SECURITY_GROUP_ID" \
    --protocol tcp \
    --port 3306 \
    --cidr 0.0.0.0/0 \
    --region "$REGION" \
    --profile personal 2>/dev/null || echo "   Rule may already exist"
fi

echo ""
echo "💾 Save password to AWS Parameter Store? (recommended)"
read -p "   This allows SAM to retrieve it automatically (yes/no): " SAVE_PASSWORD

if [ "$SAVE_PASSWORD" = "yes" ]; then
  aws ssm put-parameter \
    --name "/cachao/database/password" \
    --value "$DB_PASSWORD" \
    --type "SecureString" \
    --overwrite \
    --region "$REGION" \
    --profile personal
  
  echo "   ✅ Password saved to Parameter Store: /cachao/database/password"
fi

echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Update template.yaml:"
echo "   - Remove VpcConfig from all Lambda functions"
echo "   - Remove VPC endpoint resources (S3VPCEndpoint, CognitoVPCEndpoint, etc.)"
echo "   - Update DB_HOST environment variable to: $DB_ENDPOINT"
echo ""
echo "2. Update your database connection code to use SSL:"
echo "   ssl: { rejectUnauthorized: false }  // For dev only"
echo ""
echo "3. Test the connection:"
echo "   mariadb -h $DB_ENDPOINT -u $DB_USER -p $DB_NAME"
echo ""
echo "4. Deploy updated stack:"
echo "   sam build && sam deploy"
echo ""
echo "💰 Cost Savings:"
echo "   - Old: Aurora + VPC = ~\$100-200/month"
echo "   - New: RDS t3.micro = ~\$15/month"
echo "   - Savings: ~85-90%"
echo ""




