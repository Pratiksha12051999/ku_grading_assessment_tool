#!/usr/bin/env bash
set -euo pipefail

# KU Essay Grading - Simplified Deployment Script (No GitHub Token Required)
# Based on Scottsdale Plan Review approach

echo "🚀 KU Essay Grading - Simplified Deployment"
echo "==========================================="

# --------------------------------------------------
# 1. Auto-detect GitHub URL and get configuration
# --------------------------------------------------

# Auto-detect GitHub URL from current repo
GITHUB_URL=$(git remote get-url origin 2>/dev/null)
if [ -z "$GITHUB_URL" ]; then
    echo "❌ Could not detect GitHub URL. Make sure you're in a git repository."
    echo "Run this script from your cloned repository directory."
    exit 1
fi
echo "📡 Detected GitHub URL: $GITHUB_URL"

# Extract owner and repo from URL for display
if [[ $GITHUB_URL =~ github\.com[:/]([^/]+)/([^/]+)(\.git)?$ ]]; then
    GITHUB_OWNER="${BASH_REMATCH[1]}"
    GITHUB_REPO="${BASH_REMATCH[2]%.git}"
    echo "📁 Repository: $GITHUB_OWNER/$GITHUB_REPO"
else
    echo "⚠️  Could not parse GitHub owner/repo, but proceeding with URL: $GITHUB_URL"
fi

# Project name
if [ -z "${PROJECT_NAME:-}" ]; then
    read -rp "Enter the CodeBuild project name [ku-essay-grading-deploy]: " PROJECT_NAME
    PROJECT_NAME=${PROJECT_NAME:-ku-essay-grading-deploy}
fi

# AWS Configuration
if [ -z "${AWS_PROFILE:-}" ]; then
    read -rp "Enter AWS profile name [default]: " AWS_PROFILE
    AWS_PROFILE=${AWS_PROFILE:-default}
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

# Action (deploy or destroy)
if [ -z "${ACTION:-}" ]; then
    read -rp "Would you like to [deploy] or [destroy] the stacks? Type deploy or destroy: " ACTION
    ACTION=$(printf '%s' "$ACTION" | tr '[:upper:]' '[:lower:]')
fi

if [[ "$ACTION" != "deploy" && "$ACTION" != "destroy" ]]; then
    echo "❌ Invalid choice: '$ACTION'. Please run again and choose deploy or destroy."
    exit 1
fi

# Get AWS Account ID
AWS_ACCOUNT=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text 2>/dev/null)
if [ -z "$AWS_ACCOUNT" ] || [ "$AWS_ACCOUNT" = "None" ]; then
    echo "❌ Error: Could not get AWS account ID. Check your AWS profile: $AWS_PROFILE"
    exit 1
fi

echo ""
echo "📋 Configuration Summary:"
echo "  GitHub URL: $GITHUB_URL"
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
echo "🔧 Checking for IAM role: $ROLE_NAME"

if aws iam get-role --role-name "$ROLE_NAME" --profile "$AWS_PROFILE" >/dev/null 2>&1; then
    echo "✅ IAM role exists"
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

    echo "✅ IAM role created"
    echo "Waiting for IAM role to propagate..."
    sleep 10
fi

# --------------------------------------------------
# 3. Create CodeBuild project (No GitHub Token)
# --------------------------------------------------

echo "🏗️ Setting up CodeBuild project: $PROJECT_NAME"

# Build environment without GitHub token
ENVIRONMENT_CONFIG='{
    "type": "LINUX_CONTAINER",
    "image": "aws/codebuild/amazonlinux-x86_64-standard:5.0",
    "computeType": "BUILD_GENERAL1_MEDIUM",
    "environmentVariables": [
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

# Source from GitHub (no token required for public repos)
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
    echo "✅ CodeBuild project '$PROJECT_NAME' configured successfully."
else
    echo "❌ Failed to configure CodeBuild project. Please verify AWS CLI permissions and parameters."
    exit 1
fi

# --------------------------------------------------
# 4. Start the build
# --------------------------------------------------

echo ""
echo "🚀 Starting $ACTION for project '$PROJECT_NAME'..."
BUILD_RESULT=$(aws codebuild start-build \
    --project-name "$PROJECT_NAME" \
    --profile "$AWS_PROFILE" \
    --no-cli-pager \
    --output json)

if [ $? -eq 0 ]; then
    BUILD_ID=$(echo "$BUILD_RESULT" | grep -o '"id": "[^"]*"' | cut -d'"' -f4)
    echo "✅ Build started successfully: $BUILD_ID"

    echo ""
    echo "📊 Monitor your build at:"
    echo "https://$AWS_REGION.console.aws.amazon.com/codesuite/codebuild/projects/$PROJECT_NAME/history"
    echo ""
    echo "You can also monitor the build status with:"
    echo "aws codebuild batch-get-builds --ids $BUILD_ID --profile $AWS_PROFILE"
else
    echo "❌ Failed to start the build."
    exit 1
fi

# --------------------------------------------------
# 5. Monitor build (optional)
# --------------------------------------------------

read -rp "Would you like to monitor the build progress? (y/n): " MONITOR
MONITOR=$(printf '%s' "$MONITOR" | tr '[:upper:]' '[:lower:]')

if [[ "$MONITOR" == "y" || "$MONITOR" == "yes" ]]; then
    echo "⏳ Monitoring build progress..."

    while true; do
        BUILD_STATUS=$(aws codebuild batch-get-builds \
            --ids "$BUILD_ID" \
            --profile "$AWS_PROFILE" \
            --query 'builds[0].buildStatus' \
            --output text)

        case $BUILD_STATUS in
            "IN_PROGRESS")
                if [ "$ACTION" = "destroy" ]; then
                    echo "  🔥 Destruction in progress... ($(date '+%H:%M:%S'))"
                else
                    echo "  🔄 Build in progress... ($(date '+%H:%M:%S'))"
                fi
                sleep 30
                ;;
            "SUCCEEDED")
                if [ "$ACTION" = "destroy" ]; then
                    echo ""
                    echo "🎉 DESTRUCTION COMPLETED SUCCESSFULLY!"
                    echo "====================================="
                    echo "✅ All KU Essay Grading resources have been removed."

                    # Verify stacks are deleted
                    STACK_NAME="KUEssayGradingStack-${ENVIRONMENT}"
                    if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" --profile "$AWS_PROFILE" >/dev/null 2>&1; then
                        echo "⚠️  Warning: Some stacks may still exist. Check AWS Console."
                    else
                        echo "✅ Stack deletion verified."
                    fi

                else
                    echo ""
                    echo "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!"
                    echo "===================================="

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

                    echo "🌐 Frontend Application: $FRONTEND_URL"
                    echo "🔗 API Gateway: $API_URL"
                    echo "📝 Grade Essay Endpoint: ${API_URL}grade-essay"
                    echo "📋 Generate Rubric Endpoint: ${API_URL}generate-rubric"
                    echo "====================================="
                fi
                break
                ;;
            "FAILED")
                if [ "$ACTION" = "destroy" ]; then
                    echo "❌ Destruction failed!"
                    echo "Some resources may need manual cleanup."
                    echo ""
                    echo "Common issues:"
                    echo "1. S3 buckets not empty"
                    echo "2. Lambda functions with CloudWatch log retention"
                    echo "3. Security groups with dependencies"
                else
                    echo "❌ Build failed!"
                fi
                echo ""
                echo "Check the build logs for details:"
                echo "https://$AWS_REGION.console.aws.amazon.com/codesuite/codebuild/projects/$PROJECT_NAME/history"
                exit 1
                ;;
            *)
                echo "  📊 Build status: $BUILD_STATUS"
                sleep 30
                ;;
        esac
    done
fi

# --------------------------------------------------
# 6. Post-destroy cleanup (if destroy action)
# --------------------------------------------------

if [ "$ACTION" = "destroy" ]; then
    echo ""
    read -rp "Would you like to also delete the CodeBuild project and IAM role? (y/n): " CLEANUP
    CLEANUP=$(printf '%s' "$CLEANUP" | tr '[:upper:]' '[:lower:]')

    if [[ "$CLEANUP" == "y" || "$CLEANUP" == "yes" ]]; then
        echo "🧹 Cleaning up deployment resources..."

        # Delete CodeBuild project
        echo "Deleting CodeBuild project: $PROJECT_NAME"
        aws codebuild delete-project --name "$PROJECT_NAME" --profile "$AWS_PROFILE" 2>/dev/null || echo "CodeBuild project already deleted or doesn't exist"

        # Delete IAM role
        echo "Deleting IAM role: $ROLE_NAME"
        aws iam detach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/AdministratorAccess --profile "$AWS_PROFILE" 2>/dev/null || true
        aws iam delete-role-policy --role-name "$ROLE_NAME" --policy-name "BedrockAccess" --profile "$AWS_PROFILE" 2>/dev/null || true
        aws iam delete-role --role-name "$ROLE_NAME" --profile "$AWS_PROFILE" 2>/dev/null || echo "IAM role already deleted or doesn't exist"

        echo "✅ Cleanup completed!"
    fi
fi

echo ""
echo "🎯 Deployment script completed!"
echo "Check the CodeBuild console for detailed logs and status."
echo ""
echo "📚 Useful commands:"
echo "  List stacks: aws cloudformation list-stacks --profile $AWS_PROFILE"
echo "  Build history: aws codebuild list-builds-for-project --project-name $PROJECT_NAME --profile $AWS_PROFILE"