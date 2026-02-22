# Kansas University Grading Tool

Kansas University (KU) uses the KITE platform for standardized testing and seeks to enhance written-response assessment with AI. Manual essay grading is slow, costly, and can vary across evaluators. This proof-of-concept (POC) delivers an automated, rubric-aware scoring solution that maintains accuracy while improving speed and scalability.
The KU Grading tool is an automated essay scoring solution designed to enhance the assessment process. This project leverages AWS Bedrock to provide consistent, efficient, and scalable grading aligned with educational standards.

This application is built using AWS CDK for infrastructure as code, AWS Lambda for serverless compute, API Gateway for RESTful endpoints, and a React frontend for user interaction. The backend integrates with an AWS bedrock via API to perform essay grading based on predefined rubrics. It reduces  grading time and resource usage by automating the evaluation process while ensuring alignment with educational standards.


## Demo Video

<video src="https://github.com/user-attachments/assets/43b9ce96-9d9a-42ee-a220-fe1c1e79dd9e" controls width="100%"></video>

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
    │   └── pages/       # React pages
    └── package.json     # Node.js dependencies
```
## Architecture

![Architecture Diagram](./docs/Architecture.png)

## Deployment

### Common Prerequisites
[Common Prerequisites can be found here](/docs/common_prerequisites.md).

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

[Usage Guide can be found here](/docs/usage_guide.md).

## API Documentation

Here you can learn about the API the project uses: [API Documentation](/docs/api_doc.md).

## Modification Guide

[Modification Guide can be found here](/docs/modification_guide.md).

## Credits
This application was architected and developed by [Pratiksha Wadibhasme](https://www.linkedin.com/in/pratikshawadibhasme/), [Syna Malhan](https://www.linkedin.com/in/synamalhan/), and [Ashik Mathew Tharakan](https://www.linkedin.com/in/ashik-tharakan/), with solutions architect [Arun Arunachalam](https://www.linkedin.com/in/arunarunachalam/), program manager [Thomas Orr](https://www.linkedin.com/in/thomas-orr/) and product manager [Rachel Hayden](https://www.linkedin.com/in/rachelhayden/). Thanks to the ASU Cloud Innovation Centre Technical and Project Management teams for their guidance and support.

## License
This project is distributed under the [MIT License](LICENSE).
