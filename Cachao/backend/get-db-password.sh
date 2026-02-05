#!/bin/bash
# Script to retrieve database password from various sources

echo "🔐 Retrieving Database Password"
echo "==============================="
echo ""

# Try Parameter Store first
echo "1. Trying AWS Parameter Store..."
DB_PASSWORD=$(aws ssm get-parameter --name "/cachao/database/password" --with-decryption --profile personal --query 'Parameter.Value' --output text 2>/dev/null)

if [ -n "$DB_PASSWORD" ]; then
  echo "✅ Found in Parameter Store"
  echo "Password: $DB_PASSWORD"
  exit 0
fi

# Try CloudFormation stack parameters
echo "2. Trying CloudFormation stack parameters..."
DB_PASSWORD=$(aws cloudformation describe-stacks --stack-name Cachao --profile personal --query 'Stacks[0].Parameters[?ParameterKey==`DatabasePassword`].ParameterValue' --output text 2>/dev/null)

if [ -n "$DB_PASSWORD" ] && [ "$DB_PASSWORD" != "None" ]; then
  echo "✅ Found in CloudFormation"
  echo "Password: $DB_PASSWORD"
  exit 0
fi

# If not found, provide instructions
echo "❌ Password not found in AWS"
echo ""
echo "Options:"
echo "1. Check your CloudFormation stack parameters:"
echo "   aws cloudformation describe-stacks --stack-name Cachao --profile personal"
echo ""
echo "2. Check Parameter Store:"
echo "   aws ssm get-parameter --name '/cachao/database/password' --with-decryption --profile personal"
echo ""
echo "3. If you know the password, you can use it directly when running queries"
echo ""
echo "4. To query the database, you can use:"
echo "   mariadb -h cachao-dev-db.cetzgm3nbskt.eu-west-1.rds.amazonaws.com -u admin -p cachao"
echo "   (It will prompt you for the password)"


