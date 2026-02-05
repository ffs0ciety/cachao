#!/bin/bash
# Script to find the database password from various sources

echo "🔍 Searching for Database Password"
echo "==================================="
echo ""

# Method 1: AWS Parameter Store
echo "1️⃣ Checking AWS Parameter Store..."
PASSWORD=$(aws ssm get-parameter --name "/cachao/database/password" --with-decryption --profile personal --query 'Parameter.Value' --output text 2>/dev/null)

if [ -n "$PASSWORD" ] && [ "$PASSWORD" != "None" ]; then
  echo "✅ Found in Parameter Store!"
  echo "   Password: $PASSWORD"
  echo ""
  echo "You can use this password to query the database."
  exit 0
fi

# Method 2: Try without profile
echo "2️⃣ Trying Parameter Store without profile..."
PASSWORD=$(aws ssm get-parameter --name "/cachao/database/password" --with-decryption --query 'Parameter.Value' --output text 2>/dev/null)

if [ -n "$PASSWORD" ] && [ "$PASSWORD" != "None" ]; then
  echo "✅ Found in Parameter Store!"
  echo "   Password: $PASSWORD"
  exit 0
fi

# Method 3: CloudFormation Stack Parameters
echo "3️⃣ Checking CloudFormation stack parameters..."
PASSWORD=$(aws cloudformation describe-stacks --stack-name Cachao --profile personal --query 'Stacks[0].Parameters[?ParameterKey==`DatabasePassword`].ParameterValue' --output text 2>/dev/null)

if [ -n "$PASSWORD" ] && [ "$PASSWORD" != "None" ]; then
  echo "✅ Found in CloudFormation!"
  echo "   Password: $PASSWORD"
  exit 0
fi

# Method 4: List all parameters to see what's available
echo "4️⃣ Listing available SSM parameters..."
echo ""
aws ssm describe-parameters --query 'Parameters[?contains(Name, `cachao`) || contains(Name, `database`)].Name' --output table 2>/dev/null || echo "   Could not list parameters"

echo ""
echo "❌ Password not found in AWS"
echo ""
echo "📝 Options:"
echo ""
echo "Option 1: Check if you remember the password you used when creating the database"
echo "   If you used one of the creation scripts, you would have entered it then."
echo ""
echo "Option 2: Reset the database password"
echo "   You can reset it via AWS Console or CLI:"
echo "   aws rds modify-db-instance --db-instance-identifier cachao-dev-db --master-user-password NEW_PASSWORD --apply-immediately --profile personal"
echo ""
echo "Option 3: Query the database directly (it will prompt for password)"
echo "   mariadb -h cachao-dev-db.cetzgm3nbskt.eu-west-1.rds.amazonaws.com -u admin -p cachao"
echo ""
echo "Option 4: Use the API endpoint instead (no password needed)"
echo "   GET https://oi7p8gbold.execute-api.eu-west-1.amazonaws.com/Prod/admin/ticket-orders"
echo "   (Requires authentication token)"


