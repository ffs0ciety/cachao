#!/bin/bash
# Non-interactive RDS creation script
# Usage: DB_PASSWORD="your-password" ./create-rds-non-interactive.sh

set -e

DB_INSTANCE_ID="cachao-dev-db"
DB_NAME="cachao"
DB_USER="admin"
REGION="eu-west-1"
INSTANCE_CLASS="db.t3.micro"

# Get password from environment variable
if [ -z "$DB_PASSWORD" ]; then
  echo "❌ Error: DB_PASSWORD environment variable is required"
  echo ""
  echo "Usage:"
  echo "  DB_PASSWORD='your-password' ./create-rds-non-interactive.sh"
  echo ""
  exit 1
fi

echo "🚀 Creating RDS MariaDB instance..."
echo "   Instance: $DB_INSTANCE_ID"
echo "   Class: $INSTANCE_CLASS"
echo "   Region: $REGION"
echo ""

# Check if instance already exists
if aws rds describe-db-instances --db-instance-identifier "$DB_INSTANCE_ID" --region "$REGION" --profile personal &>/dev/null; then
  echo "⚠️  Instance $DB_INSTANCE_ID already exists!"
  echo "   Getting existing endpoint..."
  DB_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --region "$REGION" \
    --profile personal \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text 2>/dev/null || echo "")
  
  if [ -n "$DB_ENDPOINT" ]; then
    echo "   ✅ Existing endpoint: $DB_ENDPOINT"
    echo ""
    echo "📝 To update template.yaml, run:"
    echo "   ./update-template-with-rds-endpoint.sh \"$DB_ENDPOINT\""
    exit 0
  fi
fi

echo "📦 Creating RDS instance..."
echo "   This will take 5-10 minutes..."
echo ""

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
echo "⏳ Instance creation started. Waiting for it to be available..."
echo "   This will take 5-10 minutes..."
echo ""

# Wait for instance to be available
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
aws ec2 authorize-security-group-ingress \
  --group-id "$SECURITY_GROUP_ID" \
  --protocol tcp \
  --port 3306 \
  --cidr 0.0.0.0/0 \
  --region "$REGION" \
  --profile personal 2>/dev/null && echo "   ✅ Security group updated" || echo "   ⚠️  Rule may already exist"

# Save password to Parameter Store
echo ""
echo "💾 Saving password to AWS Parameter Store..."
aws ssm put-parameter \
  --name "/cachao/database/password" \
  --value "$DB_PASSWORD" \
  --type "SecureString" \
  --overwrite \
  --region "$REGION" \
  --profile personal 2>/dev/null && echo "   ✅ Password saved to Parameter Store" || echo "   ⚠️  Could not save password (may already exist)"

echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Update template.yaml with the new endpoint:"
echo "   ./update-template-with-rds-endpoint.sh \"$DB_ENDPOINT\""
echo ""
echo "2. Deploy updated stack:"
echo "   sam build && sam deploy"
echo ""




