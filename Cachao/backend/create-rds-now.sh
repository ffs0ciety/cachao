#!/bin/bash
# Quick script to create RDS instance - run this with your password

set -e

DB_INSTANCE_ID="cachao-dev-db"
DB_NAME="cachao"
DB_USER="admin"
REGION="eu-west-1"
INSTANCE_CLASS="db.t3.micro"

# Get password from command line or prompt
if [ -z "$1" ]; then
  read -sp "Enter database password: " DB_PASSWORD
  echo ""
else
  DB_PASSWORD="$1"
fi

echo "🚀 Creating RDS MariaDB instance..."
echo "   Instance: $DB_INSTANCE_ID"
echo "   Class: $INSTANCE_CLASS"
echo "   Region: $REGION"
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
echo "⏳ Instance creation started. This will take 5-10 minutes..."
echo "   You can check status with:"
echo "   aws rds describe-db-instances --db-instance-identifier $DB_INSTANCE_ID --region $REGION --profile personal"
echo ""

# Wait for instance to be available
echo "Waiting for instance to be available..."
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
  --profile personal 2>/dev/null || echo "   Rule may already exist"

echo ""
echo "💾 Save password to AWS Parameter Store? (recommended)"
read -p "   Enter 'yes' to save, or press Enter to skip: " SAVE_PASSWORD

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
echo "1. Update template.yaml with the new endpoint:"
echo "   DB_HOST: $DB_ENDPOINT"
echo ""
echo "2. Deploy updated stack:"
echo "   sam build && sam deploy"
echo ""




