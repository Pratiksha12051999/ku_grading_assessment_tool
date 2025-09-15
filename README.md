# Kansas University Grading Tool

Kansas University (KU) uses the KITE platform for standardized testing and seeks to enhance written-response assessment with AI. Manual essay grading is slow, costly, and can vary across evaluators. This proof-of-concept (POC) delivers an automated, rubric-aware scoring solution that maintains accuracy while improving speed and scalability.
The KU Grading tool is an automated essay scoring solution designed to enhance the assessment process. This project leverages AWS Bedrock to provide consistent, efficient, and scalable grading aligned with educational standards.

This application is built using AWS CDK for infrastructure as code, AWS Lambda for serverless compute, API Gateway for RESTful endpoints, and a React frontend for user interaction. The backend integrates with an AWS bedrock via API to perform essay grading based on predefined rubrics. It reduces  grading time and resource usage by automating the evaluation process while ensuring alignment with educational standards.

## 📖 Table of Contents

| Section                                       | Description                                                        |
|-----------------------------------------------|--------------------------------------------------------------------|
| [Project Structure](#project-structure)       | Detailed breakdown of files and directories                        |
| [Repository Structure](#repository-structure) | Core functionality, technical capabilities, and analytics          |
| [Architecture](#architecture)                 | Technology stack, system components, and infrastructure            |
| [Prerequisites](#prerequisites)               | AWS requirements, development environment, and tools               |
| [Deployment Options](#deployment)             | Automated and manual deployment methods                            |
| [Usage Guide](#usage-guide)                   | Step-by-step guide for setup, rubric generation, and essay grading |
| [API Documentation](#api-documentation)       | Endpoints, authentication, and rate limits                         |
| [Modification Guide](#modification-guide)     | Endpoints, authentication, and rate limits                         |
| [Credits](#credits)                           | Credits to contributors of the project                             |
| [License](#license)                           | MIT License for project distribution                               |

---

## Project Structure

- `backend/` - AWS CDK infrastructure code
- `frontend/` - Frontend application
- `/backend/lambdas/` - AWS Lambda functions
- `docs/` - Documentation and architecture diagrams
- `buildspec.yml` - AWS CodeBuild configuration file

## Repository Structure

```
.
├── buildspec.yml           # AWS CodeBuild configuration
├── deploy-ku-essay-grading.sh   # AWS CodeBuild script for deployment
├── configure-frontend.sh   # Script to configure frontend with backend details
├── docs/                   # Documentation and architecture diagrams
│   └── architecture.png    # Architecture diagram
├── backend/               # Backend infrastructure code
│   ├── app.py            # CDK app entry point
│   ├── cdk/              # CDK stack definitions
│   │   └── backend_stack.py
│   ├── lambda/           # Lambda function handlers
│   │   ├── grader/      # Essay grading logic
│   │   ├── auth/        # Authentication handler
│   │   └── api/         # API handlers
│   └── requirements.txt  # Python dependencies
└── frontend/            # React frontend application
    ├── public/          # Static assets
    ├── src/             # Source code
    │   ├── components/  # React components
    │   ├── services/    # API services
    │   └── utils/       # Utility functions
    └── package.json     # Node.js dependencies
```
## Architecture

![Architecture Diagram](./docs/architecture.png)

## Common Prerequisites for Deployment

### GitHub Setup
1. Fork this repository to your GitHub account:
   - Navigate to https://github.com/ASUCICREPO/ku_grading_tool
   - Click the "Fork" button in the top right corner
   - Select your GitHub account
   - Wait for forking to complete
   - Your fork will be at: https://github.com/YOUR-USERNAME/ku_grading_tool


2. Create GitHub Personal Access Token:
   - Go to GitHub Settings > Developer Settings > Personal Access Tokens > Tokens (classic)
   - Click "Generate new token (classic)"
   - Select "repo" and "admin:repo_hook" scopes
   - Save the token securely
   - [Detailed instructions](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

### AWS Bedrock Setup
Enable the following AWS Bedrock models:
- NOVA PRO

To enable models:
1. Open AWS Bedrock console
2. Navigate to "Model access"
3. Click "Manage model access"
4. Select required models
5. Save changes and wait for access approval
6. Verify "Status" shows "Access granted"

Note: Ensure your AWS account/region supports Bedrock model access

### AWS Account Setup
1. Required AWS Permissions:
   - S3 bucket creation and management
   - Lambda function deployment
   - API Gateway creation
   - DynamoDB table management
   - Cognito user pool setup
   - CloudFront distribution
   - CloudWatch logging
   - IAM role and policy management


2. AWS CLI Setup:
   ```bash
   # Download the AWS CLI installation package
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   
   # Extract the installation files
   unzip awscliv2.zip 
   
   # Run the installer
   sudo ./aws/install
   
   #Verify installation
   aws --version

3. Install Postman for testing APIs:
   - Visit https://www.postman.com/downloads/
   - Download the macOS installer
   - Drag the Postman app to your Applications folder
   - Launch Postman
   - Create a new request
   - Send a POST request to any public API (e.g., https://api.github.com)
   - Ensure you receive a successful response 


## Deployment

### Using Cloudshell and AWS CodeBuild (Easiest)

1. Go to Cloudshell on AWS Console
2. Clone your forked repository:
   ```bash
   git clone https://github.com/YOUR-USERNAME/ku_grading_tool
   cd ku_grading_tool
   ```
3. Unset AWS Profile
   ```bash
   unset AWS_PROFILE
   ```
4. Deploy using deployment script:
   ```bash
   chmod +x deploy-ku-essay-grading.sh
   ./deploy-ku-essay-grading.sh
   ```

### Using Local Terminal with AWS Codebuild for Deployment

#### Prerequisites
1. Create IAM User with Administrative Access:
   - Open AWS IAM Console
   - Navigate to "Users" in the left sidebar
   - Click "Add users"
   - Set username: `KUGradingUser`
   - Select "Access key - Programmatic access"
   - Click "Next: Permissions"
   - Choose "Attach policies directly"
   - Search for and select "AdministratorAccess"
   - Review and click "Create user"
   - Download or save the Access Key ID and Secret Access Key


2. Configure AWS Credentials:
   ```bash
   # Configure AWS CLI with the new user credentials
   aws configure --profile KUGradingUser
   # Enter the following when prompted:
   # - AWS Access Key ID
   # - AWS Secret Access Key
   # - Default region (e.g., us-east-1)
   # - Default output format (json)
   
3. Clone your forked repository:
   ```bash
   git clone https://github.com/YOUR-USERNAME/ku_grading_tool
   cd ku_grading_tool
   ```
4. Deploy using deployment script:
   ```bash
   chmod +x deploy-ku-essay-grading.sh
   ./deploy-ku-essay-grading.sh
   ```
  
### Manual Deployment


1. Clone your forked repository:
   ```bash
   git clone https://github.com/YOUR-USERNAME/ku_grading_tool
   cd ku_grading_tool
   cd backend

   # Step 1: Create and activate virtual environment
   python3 -m venv ku-env
   source ku-env/bin/activate

   # Step 2: Install dependencies
   python -m pip install --upgrade pip
   pip install aws-cdk-lib
   pip install -r requirements.txt

   # Step 3: Install CDK CLI (if needed)
   npm install -g aws-cdk

   # Step 4: Bootstrap (one-time per account/region)
   cdk bootstrap --context account=<AWS_ACCOUNT_ID> --context region=us-east-1 --profile <AWS_PROFILE>

   # Step 5: Deploy
   cdk deploy --profile <AWS_PROFILE> -c env=dev -c account=<AWS_ACCOUNT_ID> -c region=us-east-1 -c profile=<AWS_PROFILE> --allcd backend
   ```

   Run the configuration script to update the .env file for deploying the frontend.
     
      ```bash
      cd ..
      chmod +x configure-frontend.sh
      ./configure-frontend.sh
      
      cd frontend
      npm install
      npm run build
      ```

## Usage Guide

1. Download Required Sample Files and upload them in kudocuments S3 bucket. We are generating rubric for Essay Set 8 (Narrative Essay).
   2. Upload the following files to the S3 bucket created by CDK stack. You can find the bucket name in the CloudFormation outputs in AWS Console.

      You can use the following links to download the files:
      1. original_rubric_guidelines_s3_file : https://drive.google.com/file/d/1E3-tJzc26ZZdYGb6J0ie4qDWUDDivY3U/view?usp=drive_link
         
         Note : This document must have rubric generation guidelines for the essay_type you are generating the rubric for. Check sample file for reference.
   
      2. sample_essays_csv_s3_file : https://drive.google.com/file/d/1hyPNc6EKhJfiQ6jV11hwq6a2nsik3jBT/view?usp=drive_link
      
         Note : This file contains sample essay responses and essay scores for the essay type you are trying to grade. A bigger sample of examples would mean better context for the LLM to generate the rubric based on these sample essays. Check sample file for reference.

2.Use this JSON body to call the Generate Rubric endpoint: Replace the S3 URLs with the ones you uploaded in step 1.
   ```json
   {
     "input_type": "direct",
     "content_id": "1",
     "essay_type": "Narrative",
     "grade_level": "10",
     "source_text_title": "",
     "author": "",
     "essay_prompt": "We all understand the benefits of laughter. For example, someone once said, “Laughter is the shortest distance between two people.” Many other people believe that laughter is an important part of any relationship. Tell a true story in which laughter was one element or part.",
     "score_range": "1-6",
     "source_text_content": "",
     "original_rubric_guidelines_s3_url": "s3://kuessaygradingstack-dev-kudocumentsbucketfaec8400-nsot9pq5xre3/EssaySet8_ReadMeFirst.pdf",
     "sample_essays_csv_s3_url": "s3://kuessaygradingstack-dev-kudocumentsbucketfaec8400-nsot9pq5xre3/dataset_8.csv"
   }
   ```
3. Hit the Generate Rubric Endpoint from postman and ensure you get a 200 response.

4. Now Upload this sample json file to the frontend application to grade essays. 

   Sample JSON file : https://drive.google.com/file/d/1sLRZEm_6zgWSqbZh108xse4de9E8p0VR/view?usp=drive_link

## API Documentation

Here you can learn about the API the project uses: [API Documentation](/docs/api_doc.md).

## Modification Guide



## Credits
This application was architected and developed by [Pratiksha Wadibhasme](https://www.linkedin.com/in/pratikshawadibhasme/), [Syna Malhan](https://www.linkedin.com/in/synamalhan/), and [Ashik Mathew Tharakan](https://www.linkedin.com/in/ashik-tharakan/), with solutions architect [Arun Arunachalam](https://www.linkedin.com/in/arunarunachalam/), program manager [Thomas Orr](https://www.linkedin.com/in/thomas-orr/) and product manager [Rachel Hayden](https://www.linkedin.com/in/rachelhayden/). Thanks to the ASU Cloud Innovation Centre Technical and Project Management teams for their guidance and support.

## License
This project is distributed under the [MIT License](LICENSE).