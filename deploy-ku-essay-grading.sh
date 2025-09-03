#!/usr/bin/env bash
set -euo pipefail

# KU Essay Grading - GitHub Token Deployment Script
# Similar approach to the reference script with GITHUB_TOKEN

echo "KU Essay Grading - GitHub Token Deployment"
echo "=========================================="

# --------------------------------------------------
# 1. Prompt for all required values
# --------------------------------------------------

# 1) Prompt for GITHUB_URL if unset
if [ -z "${GITHUB_URL:-}" ]; then
  read -rp "Enter GitHub repository URL (e.g. https://github.com/Pratiksha12051999/ku_grading_tool): " GITHUB_URL
fi

# 2) Normalize URL (strip .git and any trailing slash)
clean_url=${GITHUB_URL%.git}
clean_url=${clean_url%/}

# 3) Extract the path part (owner/repo) for HTTPS URLs
if [[ $clean_url =~ ^https://github\.com/([^/]+/[^/]+)$ ]]; then
  path="${BASH_REMATCH[1]}"
else
  echo "Unable to parse owner/repo from '$GITHUB_URL'"
  read -rp "Enter GitHub owner manually: " GITHUB_OWNER
  read -rp "Enter GitHub repo manually: " GITHUB_REPO
  echo "Using GITHUB_OWNER=$GITHUB_OWNER"
  echo "Using GITHUB_REPO=$GITHUB_REPO"
fi

# 4) Split into owner and repo (if we got the path)
if [ -n "${path:-}" ]; then
  GITHUB_OWNER=${path%%/*}
  GITHUB_REPO=${path##*/}
fi

# 5) Confirm detection
echo "Detected GitHub Owner: $GITHUB_OWNER"
echo "Detected GitHub Repo: $GITHUB_REPO"
read -rp "Is this correct? (y/n): " CONFIRM
CONFIRM=$(printf '%s' "$CONFIRM" | tr '[:upper:]' '[:lower:]')

if [[ "$CONFIRM" != "y" && "$CONFIRM" != "yes" ]]; then
  read -rp "Enter GitHub owner manually: " GITHUB_OWNER
  read -rp "Enter GitHub repo manually: " GITHUB_REPO
fi

echo "Final GITHUB_OWNER=$GITHUB_OWNER"
echo "Final GITHUB_REPO=$GITHUB_REPO"

# 2) Prompt for PROJECT_NAME
if [ -z "${PROJECT_NAME:-}" ]; then
  read -rp "Enter the CodeBuild project name (e.g. ku-essay-grading-deploy): " PROJECT_NAME
fi

# 3) Prompt for GITHUB_TOKEN
if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo ""
  echo "GitHub Personal Access Token Required:"
  echo "1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)"
  echo "2. Generate new token with 'repo' scope"
  echo "3. Copy the token (starts with 'ghp_' or 'github_pat_')"
  echo ""
  read -rsp "Enter your GitHub Personal Access Token: " GITHUB_TOKEN
  echo ""
fi

# 4) AWS Configuration
if [ -z "${AWS_PROFILE:-}" ]; then
  read -rp "Enter AWS profile name [default]: " AWS_PROFILE
  AWS_PROFILE=${AWS_PROFILE}
fi

if [ -z "${ENVIRONMENT:-}" ]; then
  read -rp "Enter environment (dev/test/prod) [dev]: " ENVIRONMENT
  ENVIRONMENT=${ENVIRONMENT:-dev}
fi

if [ -z "${AWS_REGION:-}" ]; then
  AWS_REGION=$(aws configure get region --profile "$AWS_PROFILE" 2>/dev/null || echo "us-east-1")
  read -rp "Enter AWS region [$AWS_REGION]: " AWS_REGION_INPUT
  AWS_REGION=${AWS_REGION_INPUT:-$AWS_REGION}
fi

# 5) Action (deploy or destroy)
if [ -z "${ACTION:-}" ]; then
  read -rp "Would you like to [deploy] or [destroy] the stacks? Type deploy or destroy: " ACTION
  ACTION=$(printf '%s' "$ACTION" | tr '[:upper:]' '[:lower:]')
fi

if [[ "$ACTION" != "deploy" && "$ACTION" != "destroy" ]]; then
  echo "Invalid choice: '$ACTION'. Please run again and choose deploy or destroy."
  exit 1
fi

# Get AWS Account ID
AWS_ACCOUNT=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text 2>/dev/null)
if [ -z "$AWS_ACCOUNT" ] || [ "$AWS_ACCOUNT" = "None" ]; then
    echo "Error: Could not get AWS account ID. Check your AWS profile: $AWS_PROFILE"
    exit 1
fi

echo ""
echo "Configuration Summary:"
echo "  GitHub Owner: $GITHUB_OWNER"
echo "  GitHub Repo: $GITHUB_REPO"
echo "  Project Name: $PROJECT_NAME"
echo "  AWS Profile: $AWS_PROFILE"
echo "  Environment: $ENVIRONMENT"
echo "  AWS Region: $AWS_REGION"
echo "  AWS Account: $AWS_ACCOUNT"
echo "  Action: $ACTION"
echo ""

# --------------------------------------------------
# 2. Ensure IAM service role exists
# --------------------------------------------------

ROLE_NAME="${PROJECT_NAME}-service-role"
echo "Checking for IAM role: $ROLE_NAME"

if aws iam get-role --role-name "$ROLE_NAME" --profile "$AWS_PROFILE" >/dev/null 2>&1; then
  echo "IAM role exists"
  ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --profile "$AWS_PROFILE" --query 'Role.Arn' --output text)
else
  echo "Creating IAM role: $ROLE_NAME"
  TRUST_DOC='{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"Service":"codebuild.amazonaws.com"},
      "Action":"sts:AssumeRole"
    }]
  }'

  ROLE_ARN=$(aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST_DOC" \
    --profile "$AWS_PROFILE" \
    --query 'Role.Arn' --output text)

  echo "Attaching AdministratorAccess policy..."
  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/AdministratorAccess \
    --profile "$AWS_PROFILE"

  # Additional permissions for Bedrock
  BEDROCK_POLICY='{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:ListFoundationModels"
      ],
      "Resource": "*"
    }]
  }'

  aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "BedrockAccess" \
    --policy-document "$BEDROCK_POLICY" \
    --profile "$AWS_PROFILE"

  echo "IAM role created"
  echo "Waiting for IAM role to propagate..."
  sleep 10
fi

# --------------------------------------------------
# 3. Create CodeBuild project
# --------------------------------------------------

echo "Creating CodeBuild project: $PROJECT_NAME"

# Build environment with explicit environmentVariables
ENVIRONMENT_CONFIG='{
  "type": "LINUX_CONTAINER",
  "image": "aws/codebuild/amazonlinux-x86_64-standard:5.0",
  "computeType": "BUILD_GENERAL1_MEDIUM",
  "environmentVariables": [
    {
      "name":  "GITHUB_TOKEN",
      "value": "'"$GITHUB_TOKEN"'",
      "type":  "PLAINTEXT"
    },
    {
      "name":  "GITHUB_OWNER",
      "value": "'"$GITHUB_OWNER"'",
      "type":  "PLAINTEXT"
    },
    {
      "name":  "GITHUB_REPO",
      "value": "'"$GITHUB_REPO"'",
      "type":  "PLAINTEXT"
    },
    {
      "name":  "AWS_PROFILE",
      "value": "'"$AWS_PROFILE"'",
      "type":  "PLAINTEXT"
    },
    {
      "name":  "ENVIRONMENT",
      "value": "'"$ENVIRONMENT"'",
      "type":  "PLAINTEXT"
    },
    {
      "name":  "AWS_REGION",
      "value": "'"$AWS_REGION"'",
      "type":  "PLAINTEXT"
    },
    {
      "name":  "AWS_ACCOUNT",
      "value": "'"$AWS_ACCOUNT"'",
      "type":  "PLAINTEXT"
    },
    {
      "name":  "ACTION",
      "value": "'"$ACTION"'",
      "type":  "PLAINTEXT"
    }
  ]
}'

# No artifacts
ARTIFACTS='{"type":"NO_ARTIFACTS"}'

# Source from GitHub
SOURCE='{"type":"GITHUB","location":"'"$GITHUB_URL"'"}'

echo "Creating CodeBuild project '$PROJECT_NAME' using GitHub repo '$GITHUB_URL' ..."

# Check if project exists and update or create
if aws codebuild describe-project --name "$PROJECT_NAME" --profile "$AWS_PROFILE" >/dev/null 2>&1; then
  echo "Project exists, updating..."
  aws codebuild update-project \
    --name "$PROJECT_NAME" \
    --source "$SOURCE" \
    --artifacts "$ARTIFACTS" \
    --environment "$ENVIRONMENT_CONFIG" \
    --service-role "$ROLE_ARN" \
    --profile "$AWS_PROFILE" \
    --output json \
    --no-cli-pager >/dev/null
else
  echo "Creating new project..."
  aws codebuild create-project \
    --name "$PROJECT_NAME" \
    --source "$SOURCE" \
    --artifacts "$ARTIFACTS" \
    --environment "$ENVIRONMENT_CONFIG" \
    --service-role "$ROLE_ARN" \
    --profile "$AWS_PROFILE" \
    --output json \
    --no-cli-pager >/dev/null
fi

if [ $? -eq 0 ]; then
  echo "CodeBuild project '$PROJECT_NAME' configured successfully."
else
  echo "Failed to configure CodeBuild project. Please verify AWS CLI permissions and parameters."
  exit 1
fi

# --------------------------------------------------
# 4. Start the build
# --------------------------------------------------

echo "Starting build for project '$PROJECT_NAME'..."
BUILD_RESULT=$(aws codebuild start-build \
  --project-name "$PROJECT_NAME" \
  --profile "$AWS_PROFILE" \
  --no-cli-pager \
  --output json)

if [ $? -eq 0 ]; then
  BUILD_ID=$(echo "$BUILD_RESULT" | grep -o '"id": "[^"]*"' | cut -d'"' -f4)
  echo "Build started successfully: $BUILD_ID"

  echo ""
  echo "Monitor your build at:"
  echo "https://$AWS_REGION.console.aws.amazon.com/codesuite/codebuild/projects/$PROJECT_NAME/history"
  echo ""
  echo "You can also monitor the build status with:"
  echo "aws codebuild batch-get-builds --ids $BUILD_ID --profile $AWS_PROFILE"
else
  echo "Failed to start the build."
  exit 1
fi

# --------------------------------------------------
# 5. Monitor build (optional)
# --------------------------------------------------

read -rp "Would you like to monitor the build progress? (y/n): " MONITOR
MONITOR=$(printf '%s' "$MONITOR" | tr '[:upper:]' '[:lower:]')

if [[ "$MONITOR" == "y" || "$MONITOR" == "yes" ]]; then
  echo "Monitoring build progress..."

  while true; do
    BUILD_STATUS=$(aws codebuild batch-get-builds \
      --ids "$BUILD_ID" \
      --profile "$AWS_PROFILE" \
      --query 'builds[0].buildStatus' \
      --output text)

    case $BUILD_STATUS in
      "IN_PROGRESS")
        echo "Build in progress... ($(date '+%H:%M:%S'))"
        sleep 30
        ;;
      "SUCCEEDED")
        echo "Build completed successfully!"

        if [ "$ACTION" = "deploy" ]; then
          echo ""
          echo "Getting deployment outputs..."

          # Get stack outputs
          STACK_NAME="KUEssayGradingStack-${ENVIRONMENT}"

          API_URL=$(aws cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE" \
            --query 'Stacks[0].Outputs[?OutputKey==`APIGatewayURL`].OutputValue' \
            --output text 2>/dev/null || echo "Not available")

          FRONTEND_URL=$(aws cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE" \
            --query 'Stacks[0].Outputs[?OutputKey==`FrontendURL`].OutputValue' \
            --output text 2>/dev/null || echo "Not available")

          echo "=========================================="
          echo "DEPLOYMENT COMPLETED SUCCESSFULLY!"
          echo "=========================================="
          echo "Frontend Application: $FRONTEND_URL"
          echo "API Gateway: $API_URL"
          echo "Grade Essay Endpoint: ${API_URL}grade-essay"
          echo "Generate Rubric Endpoint: ${API_URL}generate-rubric"
          echo "=========================================="
        fi

        break
        ;;
      "FAILED")
        echo "Build failed!"
        echo "Check the build logs in the AWS Console for details."
        exit 1
        ;;
      *)
        echo "Build status: $BUILD_STATUS"
        sleep 30
        ;;
    esac
  done
fi

echo ""
echo "Deployment script completed!"
echo "Check the CodeBuild console for detailed logs and status."