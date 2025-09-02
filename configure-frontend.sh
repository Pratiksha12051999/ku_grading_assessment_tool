#!/bin/bash
set -e

# KU Essay Grading Frontend .env Configuration Script
# This script fetches CDK outputs and creates/updates the frontend .env file

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"  # Assuming script is in scripts/ directory
FRONTEND_DIR="$PROJECT_ROOT/ku_grader_tool/frontend"
ENV_FILE="$FRONTEND_DIR/.env"

# Default values (can be overridden with command line args)
ENVIRONMENT=${1:-"dev"}
if [ "$2" = "" ] && [ -n "$CODEBUILD_SRC_DIR" ]; then
    PROFILE=""  # CodeBuild environment, use IAM role
else
    PROFILE=${2:-"KUDeveloper"}  # Local environment, use profile
fi
REGION=${3:-"us-east-1"}
STACK_NAME="KUEssayGradingStack-$ENVIRONMENT"

echo "🚀 Configuring KU Essay Grading frontend .env file"
echo "================================================="
echo "Using AWS CLI: $AWS_CLI"
echo "Stack Name: $STACK_NAME"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "Profile: $PROFILE"
echo "Frontend Dir: $FRONTEND_DIR"
echo ""

# Find system AWS CLI (not virtual environment version)
find_aws_cli() {
    # Look for AWS CLI in common system locations
    for aws_path in /usr/local/bin/aws /opt/homebrew/bin/aws /usr/bin/aws $(which aws 2>/dev/null | head -1); do
        if [ -x "$aws_path" ] && [ ! -L "$aws_path" ] || [[ "$aws_path" != *".venv"* ]]; then
            echo "$aws_path"
            return 0
        fi
    done

    # Fallback: try to use any aws that works
    echo "aws"
}

AWS_CLI=$(find_aws_cli)

# Function to get CDK outputs
get_output() {
    local output_key=$1

    if [ -n "$PROFILE" ] && [ "$PROFILE" != "null" ] && [ "$PROFILE" != "" ]; then
        $AWS_CLI cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --region "$REGION" \
            --query "Stacks[0].Outputs[?OutputKey=='$output_key'].OutputValue" \
            --profile "$PROFILE" \
            --output text 2>/dev/null || echo ""
    else
        $AWS_CLI cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --region "$REGION" \
            --query "Stacks[0].Outputs[?OutputKey=='$output_key'].OutputValue" \
            --output text 2>/dev/null || echo ""
    fi
}

# Function to list all available outputs (for debugging)
list_all_outputs() {
    echo "🔍 Available CDK Outputs:"
    echo "========================"

    if [ -n "$PROFILE" ] && [ "$PROFILE" != "null" ] && [ "$PROFILE" != "" ]; then
        $AWS_CLI cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --region "$REGION" \
            --query 'Stacks[0].Outputs[*].{Key:OutputKey, Value:OutputValue}' \
            --profile "$PROFILE" \
            --output table 2>/dev/null || echo "❌ Could not fetch outputs"
    else
        $AWS_CLI cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --region "$REGION" \
            --query 'Stacks[0].Outputs[*].{Key:OutputKey, Value:OutputValue}' \
            --output table 2>/dev/null || echo "❌ Could not fetch outputs"
    fi
    echo ""
}

# Verify stack exists and is accessible
verify_stack() {
    echo "🔍 Verifying stack access..."

    local verify_cmd="$AWS_CLI cloudformation describe-stacks --stack-name \"$STACK_NAME\" --region \"$REGION\""
    if [ -n "$PROFILE" ] && [ "$PROFILE" != "null" ] && [ "$PROFILE" != "" ]; then
        verify_cmd="$verify_cmd --profile $PROFILE"
    fi

    if eval "$verify_cmd --query 'Stacks[0].{Name:StackName, Status:StackStatus}' --output table &>/dev/null"; then
        echo "✅ Stack access verified!"
        return 0
    else
        echo "❌ Cannot access stack: $STACK_NAME"
        echo "💡 Check your AWS profile, permissions, and stack name"
        echo ""
        echo "🔧 Debug commands:"
        echo "   $AWS_CLI sts get-caller-identity --profile ${PROFILE}"
        echo "   $AWS_CLI cloudformation list-stacks --region $REGION --profile ${PROFILE}"
        return 1
    fi
}

# Create frontend directory if it doesn't exist
ensure_frontend_dir() {
    if [ ! -d "$FRONTEND_DIR" ]; then
        echo "📁 Creating frontend directory: $FRONTEND_DIR"
        mkdir -p "$FRONTEND_DIR"
    fi

    if [ ! -w "$FRONTEND_DIR" ]; then
        echo "❌ Cannot write to frontend directory: $FRONTEND_DIR"
        exit 1
    fi
}

# Main execution
main() {
    # Verify prerequisites
    if ! command -v aws &> /dev/null; then
        echo "❌ AWS CLI is not installed or not in PATH"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        echo "⚠️  jq is not installed - JSON parsing will be limited"
    fi

    # Verify stack access
    if ! verify_stack; then
        exit 1
    fi

    # List available outputs for debugging
    list_all_outputs

    # Fetch CDK outputs
    echo "📡 Fetching CDK outputs..."

    API_GATEWAY_URL=$(get_output "APIGatewayURL")
    GRADE_ESSAY_ENDPOINT=$(get_output "GradeEssayEndpoint")
    GENERATE_RUBRIC_ENDPOINT=$(get_output "GenerateRubricEndpoint")
    FRONTEND_URL=$(get_output "FrontendURL")
    CLOUDFRONT_DOMAIN=$(get_output "CloudFrontDomainName")
    RUBRICS_TABLE_NAME=$(get_output "RubricsTableName")
    OUTPUT_BUCKET_NAME=$(get_output "OutputGradingBucketName")
    DOCUMENTS_BUCKET_NAME=$(get_output "KUDocumentsBucketName")

    # Debug output values
    echo ""
    echo "🔍 Fetched values:"
    echo "=================="
    echo "API Gateway URL: '$API_GATEWAY_URL'"
    echo "Grade Essay Endpoint: '$GRADE_ESSAY_ENDPOINT'"
    echo "Generate Rubric Endpoint: '$GENERATE_RUBRIC_ENDPOINT'"
    echo "Frontend URL: '$FRONTEND_URL'"
    echo "CloudFront Domain: '$CLOUDFRONT_DOMAIN'"
    echo "Rubrics Table: '$RUBRICS_TABLE_NAME'"
    echo "Output Bucket: '$OUTPUT_BUCKET_NAME'"
    echo "Documents Bucket: '$DOCUMENTS_BUCKET_NAME'"
    echo ""

    # Validate required outputs
    if [ -z "$API_GATEWAY_URL" ] || [ "$API_GATEWAY_URL" = "None" ]; then
        echo "❌ Could not fetch API Gateway URL from CDK outputs"
        echo "💡 This usually means:"
        echo "   1. CDK stack deployment failed or is incomplete"
        echo "   2. API Gateway resource is not properly configured in CDK"
        echo "   3. CloudFormation output is missing in CDK stack"
        echo ""
        echo "🔧 Check your CDK stack and ensure API Gateway is deployed"
        exit 1
    fi

    # Ensure frontend directory exists
    ensure_frontend_dir

    # Create .env file content
    echo "📝 Creating .env file..."

    # Extract base API URL (remove trailing slash if present)
    BASE_API_URL=$(echo "$API_GATEWAY_URL" | sed 's/\/$//')

    ENV_CONTENT="# KU Essay Grading Frontend Configuration
# Generated automatically from CDK outputs on $(date)
# Stack: $STACK_NAME
# Environment: $ENVIRONMENT
# Profile: $PROFILE

# Application Configuration
REACT_APP_ENVIRONMENT=$ENVIRONMENT
REACT_APP_REGION=$REGION

# API Configuration
REACT_APP_API_URL=$BASE_API_URL
REACT_APP_GRADE_ESSAY_ENDPOINT=$GRADE_ESSAY_ENDPOINT
REACT_APP_GENERATE_RUBRIC_ENDPOINT=$GENERATE_RUBRIC_ENDPOINT

# Frontend Configuration
REACT_APP_FRONTEND_URL=$FRONTEND_URL
REACT_APP_CLOUDFRONT_DOMAIN=$CLOUDFRONT_DOMAIN

# AWS Resource Names (for reference)
REACT_APP_RUBRICS_TABLE=$RUBRICS_TABLE_NAME
REACT_APP_OUTPUT_BUCKET=$OUTPUT_BUCKET_NAME
REACT_APP_DOCUMENTS_BUCKET=$DOCUMENTS_BUCKET_NAME

# Debug Configuration
REACT_APP_DEBUG=true
REACT_APP_LOG_LEVEL=info

# Deployment Info
REACT_APP_LAST_UPDATED=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
REACT_APP_STACK_NAME=$STACK_NAME"

    # Write the .env file
    echo "$ENV_CONTENT" > "$ENV_FILE"

    # Verify the file was created
    if [ -f "$ENV_FILE" ]; then
        echo "✅ .env file created successfully!"
        echo ""
        echo "📄 Generated .env file:"
        echo "======================="
        cat "$ENV_FILE"
        echo "======================="
        echo ""
        echo "📋 Configuration Summary:"
        echo "========================"
        echo "Environment: $ENVIRONMENT"
        echo "API URL: $BASE_API_URL"
        echo "Frontend URL: ${FRONTEND_URL:-'(not deployed yet)'}"
        echo "File Location: $ENV_FILE"
        echo ""
        echo "✅ Frontend configuration complete!"
        echo ""
        echo "🚀 Next steps:"
        echo "   1. cd frontend"
        echo "   2. npm run build"
        echo "   3. Deploy with CDK: cdk deploy $STACK_NAME --profile $PROFILE"
        echo ""
    else
        echo "❌ Failed to create .env file at $ENV_FILE"
        exit 1
    fi
}

# Show usage if help requested
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0 [environment] [profile] [region]"
    echo ""
    echo "Arguments:"
    echo "  environment   Environment name (default: dev)"
    echo "  profile       AWS profile name (default: KUDeveloper)"
    echo "  region        AWS region (default: us-east-1)"
    echo ""
    echo "Examples:"
    echo "  $0                              # Use defaults"
    echo "  $0 prod                         # Production environment"
    echo "  $0 test MyProfile us-west-2     # Custom profile and region"
    echo ""
    exit 0
fi

# Run main function
main