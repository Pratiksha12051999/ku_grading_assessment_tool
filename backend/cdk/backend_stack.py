from aws_cdk import (
    Stack,
    aws_lambda as lambda_,
    aws_dynamodb as dynamodb,
    aws_apigateway as apigateway,
    aws_iam as iam,
    aws_s3 as s3,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_s3_deployment as s3deploy,
    CfnOutput,
    RemovalPolicy,
    Duration,
    Tags,
)
from constructs import Construct
import os
from aws_cdk import Size
from config import EnvironmentConfig


class KUEssayGradingStack(Stack):
    """AWS CDK Stack for KU Essay Grading System"""

    def __init__(self, scope: Construct, construct_id: str, env_name: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        self.env_name = env_name
        self.config = EnvironmentConfig.get_config(env_name)

        # Create resources
        self.create_dynamodb_tables()
        self.create_s3_buckets()
        self.create_frontend_infrastructure()
        self.create_iam_roles()
        self.create_lambda_functions()
        self.create_api_gateway()
        self.create_outputs()

        # Add environment tags
        Tags.of(self).add("Environment", env_name)
        Tags.of(self).add("Project", "KU-Essay-Grading")

    def create_dynamodb_tables(self):
        """Create DynamoDB tables"""
        # ku_grading_rubrics table with composite key structure
        self.rubrics_table = dynamodb.Table(
            self, "KURubricsTable",
            table_name="ku_grading_rubrics",
            partition_key=dynamodb.Attribute(
                name="essay_type",
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="content_id",
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=self.config["table_settings"]["billing_mode"],
            removal_policy=self.config["table_settings"]["removal_policy"],
            deletion_protection=self.env_name == "prod"
        )

    def create_s3_buckets(self):
        """Create S3 buckets"""
        # Output grading bucket (matching existing bucket name)
        self.output_grading_bucket = s3.Bucket(
            self, "KUOutputGradingBucket",
            # bucket_name="ku-grading-output-bucket",
            removal_policy=self.config["table_settings"]["removal_policy"],
            auto_delete_objects=self.env_name != "prod",
            versioned=self.env_name == "prod",
            public_read_access=False,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL
        )

        self.ku_documents_bucket = s3.Bucket(
            self, "KUDocumentsBucket",
            removal_policy=self.config["table_settings"]["removal_policy"],
            auto_delete_objects=self.env_name != "prod",
            versioned=self.env_name == "prod",
            public_read_access=False,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL
        )

    def create_frontend_infrastructure(self):
        """Create frontend hosting infrastructure with S3 and CloudFront"""

        # Frontend hosting bucket
        self.frontend_bucket = s3.Bucket(
            self, "KUFrontendBucket",
            bucket_name=f"ku-essay-grading-frontend-{self.env_name}-{self.account}",
            removal_policy=self.config["table_settings"]["removal_policy"],
            auto_delete_objects=self.env_name != "prod",
            versioned=self.env_name == "prod",
            public_read_access=False,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            # website_index_document="index.html",
            # website_error_document="index.html"  # SPA routing support
        )

        # Origin Access Identity for CloudFront
        self.origin_access_identity = cloudfront.OriginAccessIdentity(
            self, "KUFrontendOAI",
            comment=f"OAI for KU Essay Grading Frontend - {self.env_name}"
        )

        # Grant CloudFront access to S3 bucket
        self.frontend_bucket.grant_read(self.origin_access_identity)

        # CloudFront distribution
        self.cloudfront_distribution = cloudfront.Distribution(
            self, "KUFrontendDistribution",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3Origin(
                    self.frontend_bucket,
                    origin_access_identity=self.origin_access_identity
                ),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowed_methods=cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cached_methods=cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                compress=True
            ),
            additional_behaviors={
                "/static/*": cloudfront.BehaviorOptions(
                    origin=origins.S3Origin(
                        self.frontend_bucket,
                        origin_access_identity=self.origin_access_identity
                    ),
                    viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                    compress=True
                )
            },
            default_root_object="index.html",
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.minutes(5)
                ),
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.minutes(5)
                )
            ],
            price_class=self.config.get("cloudfront_settings", {}).get(
                "price_class",
                cloudfront.PriceClass.PRICE_CLASS_100 if self.env_name != "prod" else cloudfront.PriceClass.PRICE_CLASS_ALL
            ),
            comment=f"KU Essay Grading Frontend Distribution - {self.env_name}"
        )

        # Deploy frontend files (if build directory exists)
        frontend_build_path = "../frontend/build"
        if os.path.exists(frontend_build_path):
            self.frontend_deployment = s3deploy.BucketDeployment(
                self, "KUFrontendDeployment",
                sources=[s3deploy.Source.asset(frontend_build_path)],
                destination_bucket=self.frontend_bucket,
                distribution=self.cloudfront_distribution,
                distribution_paths=["/*"],
                memory_limit=512,
                ephemeral_storage_size=Size.mebibytes(512)
            )

    def create_iam_roles(self):
        """Create IAM roles for Lambda functions with complete permissions"""

        # Rubric Generation Lambda Role (matches ku_rubric_lambda_execution_role)
        self.rubric_lambda_role = iam.Role(
            self, "KURubricLambdaExecutionRole",
            role_name="ku_rubric_lambda_execution_role",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            description="Execution role for ku_rubric_generation_lambda",
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name("service-role/AWSLambdaBasicExecutionRole")
            ]
        )

        # Grant S3 permissions using the existing ku_documents_bucket
        # This is the correct way to reference your existing bucket
        self.ku_documents_bucket.grant_read(self.rubric_lambda_role)

        # Add additional S3 permissions that grant_read might not cover
        self.rubric_lambda_role.add_to_policy(
            iam.PolicyStatement(
                sid="AdditionalS3Permissions",
                effect=iam.Effect.ALLOW,
                actions=[
                    "s3:GetObjectVersion",
                    "s3:ListBucketVersions",
                    "s3:GetBucketLocation",
                    "s3:GetBucketVersioning"
                ],
                resources=[
                    self.ku_documents_bucket.bucket_arn,
                    f"{self.ku_documents_bucket.bucket_arn}/*"
                ]
            )
        )

        # Enhanced Bedrock permissions
        self.rubric_lambda_role.add_to_policy(
            iam.PolicyStatement(
                sid="BedrockPermissions",
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream",
                    "bedrock:ListFoundationModels"
                ],
                resources=[
                    "arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0",
                    "arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0",
                    "arn:aws:bedrock:*::foundation-model/anthropic.*"
                ]
            )
        )

        # DynamoDB permissions
        self.rubric_lambda_role.add_to_policy(
            iam.PolicyStatement(
                sid="DynamoDBPermissions",
                effect=iam.Effect.ALLOW,
                actions=[
                    "dynamodb:PutItem",
                    "dynamodb:GetItem",
                    "dynamodb:Query",
                    "dynamodb:Scan",
                    "dynamodb:UpdateItem",
                    "dynamodb:DeleteItem",
                    "dynamodb:DescribeTable"
                ],
                resources=[
                    f"arn:aws:dynamodb:{self.region}:{self.account}:table/ku_grading_rubrics",
                    f"arn:aws:dynamodb:{self.region}:{self.account}:table/ku_grading_rubrics/*"
                ]
            )
        )

        # Essay Grading Lambda Role
        self.essay_grading_lambda_role = iam.Role(
            self, "KUEssayGradingLambdaRole",
            role_name=f"ku_essay_grading_lambda_role_{self.env_name}",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            description="Execution role for ku_essay_grading_lambda",
            path="/service-role/"
        )

        # Custom managed policy for CloudWatch Logs
        log_policy = iam.ManagedPolicy(
            self, "EssayGradingLambdaLogPolicy",
            managed_policy_name=f"AWSLambdaBasicExecutionRole-{self.env_name}",
            description="CloudWatch Logs policy for essay grading lambda",
            statements=[
                iam.PolicyStatement(
                    sid="CreateLogGroup",
                    effect=iam.Effect.ALLOW,
                    actions=["logs:CreateLogGroup"],
                    resources=[f"arn:aws:logs:{self.region}:{self.account}:*"]
                ),
                iam.PolicyStatement(
                    sid="LogStreamOperations",
                    effect=iam.Effect.ALLOW,
                    actions=[
                        "logs:CreateLogStream",
                        "logs:PutLogEvents"
                    ],
                    resources=[
                        f"arn:aws:logs:{self.region}:{self.account}:log-group:/aws/lambda/ku_essay_grading_lambda:*"
                    ]
                )
            ]
        )

        self.essay_grading_lambda_role.add_managed_policy(log_policy)

        # Grant the essay grading lambda read access to ku_documents_bucket too (if needed)
        self.ku_documents_bucket.grant_read(self.essay_grading_lambda_role)

        # Bedrock permissions for essay grading lambda
        self.essay_grading_lambda_role.add_to_policy(
            iam.PolicyStatement(
                sid="EssayGradingBedrockPermissions",
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream"
                ],
                resources=[
                    "arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0",
                    "arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0"
                ]
            )
        )

        # DynamoDB read permissions for essay grading lambda
        self.essay_grading_lambda_role.add_to_policy(
            iam.PolicyStatement(
                sid="EssayGradingDynamoDBRead",
                effect=iam.Effect.ALLOW,
                actions=[
                    "dynamodb:GetItem",
                    "dynamodb:Query",
                    "dynamodb:Scan",
                    "dynamodb:DescribeTable"
                ],
                resources=[
                    f"arn:aws:dynamodb:{self.region}:{self.account}:table/ku_grading_rubrics",
                    f"arn:aws:dynamodb:{self.region}:{self.account}:table/ku_grading_rubrics/*"
                ]
            )
        )

        # S3 permissions for essay grading output
        self.essay_grading_lambda_role.add_to_policy(
            iam.PolicyStatement(
                sid="EssayGradingS3WritePermissions",
                effect=iam.Effect.ALLOW,
                actions=[
                    "s3:PutObject",
                    "s3:PutObjectAcl",
                    "s3:GetObject",  # In case it needs to read back
                    "s3:ListBucket",
                    "s3:GetBucketLocation"
                ],
                resources=[
                    # Reference your output bucket created in CDK
                    self.output_grading_bucket.bucket_arn,  # Adjust to your bucket variable name
                    f"{self.output_grading_bucket.bucket_arn}/*"
                ]
            )
        )

        # Also grant using CDK's high-level method (if you have the bucket reference)
        # This is the preferred approach as it's cleaner
        if hasattr(self, 'output_grading_bucket'):
            self.output_grading_bucket.grant_write(self.essay_grading_lambda_role)
            self.output_grading_bucket.grant_read(self.essay_grading_lambda_role)  # In case it needs read access

        # Alternative: If you don't have direct bucket reference, use ARN pattern matching
        else:
            self.essay_grading_lambda_role.add_to_policy(
                iam.PolicyStatement(
                    sid="EssayGradingOutputBucketAccess",
                    effect=iam.Effect.ALLOW,
                    actions=[
                        "s3:PutObject",
                        "s3:PutObjectAcl",
                        "s3:GetObject",
                        "s3:ListBucket",
                        "s3:GetBucketLocation"
                    ],
                    resources=[
                        # Pattern match for any output bucket in your stack
                        f"arn:aws:s3:::kuessaygradingstack-{self.env_name}-*",
                        f"arn:aws:s3:::kuessaygradingstack-{self.env_name}-*/*",
                        # Specific pattern for output bucket
                        f"arn:aws:s3:::*output*bucket*",
                        f"arn:aws:s3:::*output*bucket*/*"
                    ]
                )
            )

    def create_lambda_functions(self):
        """Create Lambda functions"""

        rubric_layer = lambda_.LayerVersion(
        self, "RubricLayer",
        layer_version_name="rubric_generation_dependencies",
        compatible_runtimes=[lambda_.Runtime.PYTHON_3_11],
        code=lambda_.Code.from_asset("./lambdas/layers/rubric_gen_layer"),
        description="Layer for PDF processing dependencies"
        )

        # Rubric Generation Lambda
        self.rubric_generation_lambda = lambda_.Function(
            self, "KURubricGenerationLambda",
            function_name="ku_rubric_generation_lambda",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="lambda_function.lambda_handler",
            code=lambda_.Code.from_asset("./lambdas/rubric_generation"),
            layers=[rubric_layer],
            timeout=Duration.seconds(self.config["timeout"]["ku_rubric_generation_lambda"]),
            memory_size=self.config["memory_size"]["ku_rubric_generation_lambda"],
            role=self.rubric_lambda_role,
            environment={
                "KU_DOCUMENTS_BUCKET": self.ku_documents_bucket.bucket_name,
                "TABLE_NAME": self.rubrics_table.table_name,
                "LOG_LEVEL": "INFO"
            },
            description="Lambda function for generating rubrics"
        )

        # Essay Grading Lambda
        self.essay_grading_lambda = lambda_.Function(
            self, "KUEssayGradingLambda",
            function_name="ku_essay_grading_lambda",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="lambda_function.lambda_handler",
            code=lambda_.Code.from_asset("./lambdas/essay_grading"),  # Fixed path
            timeout=Duration.seconds(self.config["timeout"]["ku_essay_grading_lambda"]),
            memory_size=self.config["memory_size"]["ku_essay_grading_lambda"],
            role=self.essay_grading_lambda_role,
            environment={
                "RUBRICS_TABLE": self.rubrics_table.table_name,
                "OUTPUT_BUCKET_NAME": self.output_grading_bucket.bucket_name,
                "LOG_LEVEL": "INFO"
            },
            description="Lambda function for grading essays"
        )

    def create_api_gateway(self):
        """Create API Gateway matching existing configuration"""

        # Create REST API (matching existing "essay-grading-api")
        self.api = apigateway.RestApi(
            self, "KUEssayGradingAPI",
            rest_api_name="essay-grading-api",  # Exact match to existing
            description="API for automated essay grading using Bedrock",
            deploy_options=apigateway.StageOptions(
                stage_name=self.env_name,
                logging_level=self.config["api_settings"]["logging_level"],
                data_trace_enabled=self.config["api_settings"]["data_trace_enabled"],
                metrics_enabled=self.config["api_settings"]["metrics_enabled"]
            ),
            default_cors_preflight_options=apigateway.CorsOptions(
                allow_origins=["*"],
                allow_methods=["GET", "POST", "OPTIONS"],
                allow_headers=["Content-Type", "X-Amz-Date", "Authorization", "X-Api-Key", "X-Amz-Security-Token"]
            ),
            endpoint_configuration=apigateway.EndpointConfiguration(
                types=[apigateway.EndpointType.REGIONAL]
            )
        )

        # Create API Gateway integration for essay grading (AWS_PROXY integration)
        essay_grading_integration = apigateway.LambdaIntegration(
            self.essay_grading_lambda,
            proxy=True,  # Use AWS_PROXY integration like existing
            integration_responses=[
                apigateway.IntegrationResponse(
                    status_code="200",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Origin": "'*'"
                    }
                )
            ]
        )

        # Create /grade-essay resource and POST method
        grade_essay_resource = self.api.root.add_resource("grade-essay")
        grade_essay_method = grade_essay_resource.add_method(
            "POST",
            essay_grading_integration,
            authorization_type=apigateway.AuthorizationType.NONE,
            method_responses=[
                apigateway.MethodResponse(
                    status_code="200",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Origin": False
                    },
                    response_models={
                        "application/json": apigateway.Model.EMPTY_MODEL
                    }
                )
            ]
        )

        # Grant API Gateway permission to invoke essay grading lambda
        self.essay_grading_lambda.add_permission(
            "AllowAPIGatewayInvoke",
            principal=iam.ServicePrincipal("apigateway.amazonaws.com"),
            action="lambda:InvokeFunction",
            source_arn=f"arn:aws:execute-api:{self.region}:{self.account}:{self.api.rest_api_id}/*/POST/grade-essay"
        )

        # NEW: Create API Gateway integration for rubric generation
        rubric_generation_integration = apigateway.LambdaIntegration(
            self.rubric_generation_lambda,
            proxy=True,  # Use AWS_PROXY integration
            integration_responses=[
                apigateway.IntegrationResponse(
                    status_code="200",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Origin": "'*'"
                    }
                )
            ]
        )

        # NEW: Create /generate-rubric resource and POST method
        generate_rubric_resource = self.api.root.add_resource("generate-rubric")
        generate_rubric_method = generate_rubric_resource.add_method(
            "POST",
            rubric_generation_integration,
            authorization_type=apigateway.AuthorizationType.NONE,
            method_responses=[
                apigateway.MethodResponse(
                    status_code="200",
                    response_parameters={
                        "method.response.header.Access-Control-Allow-Origin": False
                    },
                    response_models={
                        "application/json": apigateway.Model.EMPTY_MODEL
                    }
                )
            ]
        )

        # NEW: Grant API Gateway permission to invoke rubric generation lambda
        self.rubric_generation_lambda.add_permission(
            "AllowAPIGatewayInvokeRubricGeneration",
            principal=iam.ServicePrincipal("apigateway.amazonaws.com"),
            action="lambda:InvokeFunction",
            source_arn=f"arn:aws:execute-api:{self.region}:{self.account}:{self.api.rest_api_id}/*/POST/generate-rubric"
        )

    def create_outputs(self):
        """Create CloudFormation outputs"""

        CfnOutput(
            self, "RubricsTableName",
            value=self.rubrics_table.table_name,
            description="Name of the rubrics DynamoDB table"
        )

        CfnOutput(
            self, "OutputGradingBucketName",
            value=self.output_grading_bucket.bucket_name,
            description="Name of the output grading S3 bucket"
        )

        CfnOutput(
            self, "KUDocumentsBucketName",
            value=self.ku_documents_bucket.bucket_name,
            description="Name of the KU Document storage S3 bucket"
        )

        CfnOutput(
            self, "RubricGenerationLambdaArn",
            value=self.rubric_generation_lambda.function_arn,
            description="ARN of the rubric generation Lambda function"
        )

        CfnOutput(
            self, "EssayGradingLambdaArn",
            value=self.essay_grading_lambda.function_arn,
            description="ARN of the essay grading Lambda function"
        )

        CfnOutput(
            self, "APIGatewayURL",
            value=self.api.url,
            description="URL of the API Gateway"
        )

        CfnOutput(
            self, "GradeEssayEndpoint",
            value=f"{self.api.url}grade-essay",
            description="Endpoint for grading essays"
        )

        CfnOutput(
            self, "GenerateRubricEndpoint",
            value=f"{self.api.url}generate-rubric",
            description="Endpoint for generating rubrics"
        )

        # Frontend outputs
        CfnOutput(
            self, "FrontendBucketName",
            value=self.frontend_bucket.bucket_name,
            description="Name of the frontend hosting S3 bucket"
        )

        CfnOutput(
            self, "CloudFrontDistributionId",
            value=self.cloudfront_distribution.distribution_id,
            description="CloudFront distribution ID"
        )

        CfnOutput(
            self, "CloudFrontDomainName",
            value=self.cloudfront_distribution.distribution_domain_name,
            description="CloudFront distribution domain name"
        )

        CfnOutput(
            self, "FrontendURL",
            value=f"https://{self.cloudfront_distribution.distribution_domain_name}",
            description="Frontend application URL"
        )