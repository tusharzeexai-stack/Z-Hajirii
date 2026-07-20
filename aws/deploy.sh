#!/usr/bin/env bash
# deploy.sh — Build and deploy all Lambda functions to AWS.
# Usage: ./aws/deploy.sh [AWS_REGION] [AWS_PROFILE]
#
# Prerequisites:
#   - AWS CLI installed and configured (aws configure)
#   - CloudFormation stack already deployed (stack.yaml)
#   - Node.js 20+ installed

set -euo pipefail

REGION=${1:-ap-south-1}
PROFILE=${2:-default}
APP=zhajirii
LAMBDA_DIR="$(cd "$(dirname "$0")/lambda" && pwd)"

echo "=== Z-Hajirii Lambda Deployer ==="
echo "Region : $REGION"
echo "Profile: $PROFILE"
echo ""

# Step 1: Install Lambda dependencies
echo "[1/3] Installing Lambda dependencies..."
cd "$LAMBDA_DIR"
npm install --omit=dev
cd -

# Step 2: Bundle into zip
echo "[2/3] Creating deployment package..."
TMPDIR=$(mktemp -d)
ZIPFILE="$TMPDIR/lambda.zip"
cd "$LAMBDA_DIR"
zip -r "$ZIPFILE" . -x "*.git*" -x "node_modules/.bin/*"
cd -
echo "    Package: $ZIPFILE ($(du -sh "$ZIPFILE" | cut -f1))"

# Step 3: Update each Lambda function
FUNCTIONS=(
  "${APP}-users"
  "${APP}-employees"
  "${APP}-attendance-logs"
  "${APP}-tasks"
  "${APP}-leave-requests"
  "${APP}-notifications"
  "${APP}-audit-logs"
  "${APP}-chat-messages"
)

echo "[3/3] Deploying to Lambda functions..."
for FN in "${FUNCTIONS[@]}"; do
  echo "  → Updating $FN ..."
  aws lambda update-function-code \
    --function-name "$FN" \
    --zip-file "fileb://$ZIPFILE" \
    --region "$REGION" \
    --profile "$PROFILE" \
    --output text \
    --query 'FunctionName' | xargs -I{} echo "    ✓ {}"
done

# Clean up
rm -rf "$TMPDIR"

echo ""
echo "=== Deploy complete! ==="
echo ""
echo "Next step: Get your API Gateway URL and set it in .env:"
echo "  VITE_API_GATEWAY_URL=https://<api-id>.execute-api.$REGION.amazonaws.com/prod"
echo ""
echo "To get the URL, run:"
echo "  aws cloudformation describe-stacks --stack-name ${APP}-stack --query 'Stacks[0].Outputs' --region $REGION --profile $PROFILE"
